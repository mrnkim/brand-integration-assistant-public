import snowflake from 'snowflake-sdk';

// Define types for query binds and results
type QueryBind = string | number | boolean | null;
type QueryResult = Record<string, unknown>[];

// Snowflake connection configuration
const snowflakeConfig = {
  account: process.env.SNOWFLAKE_ACCOUNT || '',
  username: process.env.SNOWFLAKE_USERNAME || '',
  password: process.env.SNOWFLAKE_PASSWORD || '',
  database: process.env.SNOWFLAKE_DATABASE || '',
  schema: process.env.SNOWFLAKE_SCHEMA || '',
  warehouse: process.env.SNOWFLAKE_WAREHOUSE || '',
  // Add timeout settings - significantly increased for slow warehouses
  connection_timeout: 120, // seconds - increased from 60
  request_timeout: 120,    // seconds - increased from 60
  // Disable SSL verification for development
  insecureConnect: true,
  validateDefaultParameters: false
};

// Extract just the account name without region info
function getAccountName(fullAccount: string): string {
  // If account name includes a region identifier (e.g., xy12345.us-east-1), extract just the account
  return fullAccount.includes('.') ? fullAccount : fullAccount;

}

// Connection pool to reuse connections
let connection: snowflake.Connection | null = null;

// Clear connection if it exists
export function clearConnection() {
  if (connection) {
    console.log('### DEBUG: Clearing existing Snowflake connection');
    try {
      // The destroy method may expect a callback, but TypeScript doesn't recognize it
      // @ts-expect-error - The method signature is correct but TypeScript doesn't recognize it
      connection.destroy(function(err: Error | null) {
        if (err) {
          console.error('### DEBUG ERROR: Error during connection destroy callback:', err);
        } else {
          console.log('### DEBUG: Connection destroyed successfully');
        }
      });
    } catch (err) {
      console.error('### DEBUG ERROR: Error destroying connection:', err);
    }
    connection = null;
  }
}

// Get or create Snowflake connection
export async function getSnowflakeConnection(): Promise<snowflake.Connection> {
  console.log('### DEBUG: getSnowflakeConnection called');

  // Extract just the account name without region
  const accountName = getAccountName(snowflakeConfig.account);

  console.log('### DEBUG: Connection config:', {
    account: snowflakeConfig.account,
    region: 'us-west-2',
    host: 'jab82841.us-west-2.snowflakecomputing.com', // 수동으로 넣어보기
    accountName,
    username: snowflakeConfig.username,
    database: snowflakeConfig.database,
    schema: snowflakeConfig.schema,
    warehouse: snowflakeConfig.warehouse,
    hasPassword: Boolean(snowflakeConfig.password),
    timeouts: {
      connection: snowflakeConfig.connection_timeout,
      request: snowflakeConfig.request_timeout
    },
    insecureConnect: snowflakeConfig.insecureConnect
  });

  if (connection) {
    // For development, just destroy and recreate the connection to avoid stale connections
    if (isDevelopment()) {
      console.log('### DEBUG: In development mode - clearing existing connection');
      clearConnection();
    } else {
      console.log('### DEBUG: Reusing existing Snowflake connection');
      return connection;
    }
  }

  // Check if required credentials are available
  if (!snowflakeConfig.account || !snowflakeConfig.username || !snowflakeConfig.password) {
    console.error('### DEBUG ERROR: Missing Snowflake credentials');
    throw new Error('Missing Snowflake credentials');
  }

  return new Promise((resolve, reject) => {
    console.log('### DEBUG: Creating new Snowflake connection');

    // Create connection options with enhanced SSL settings for development
    const connOptions = {
      account: 'RSWIHDD-JAB82841',         username: snowflakeConfig.username,
      host: 'RSWIHDD-JAB82841.snowflakecomputing.com', // ✅ 반드시 추가
      password: snowflakeConfig.password,
      database: snowflakeConfig.database,
      schema: snowflakeConfig.schema,
      warehouse: snowflakeConfig.warehouse,
      application: 'BrandIntegrationAssistant', // Fixed application name format
      clientSessionKeepAlive: true,
      connection_timeout: snowflakeConfig.connection_timeout,
      request_timeout: snowflakeConfig.request_timeout,

      // Add auto-resume warehouse option
      warehouse_auto_resume: true,

      // SSL verification settings
      insecureConnect: process.env.NODE_ENV === 'development', // Only in development mode

      // Node.js HTTPS agent options
      agentOptions: {
        rejectUnauthorized: false, // Disable SSL verification
        checkServerIdentity: () => undefined // Skip hostname verification
      }
    };

    // Create a new connection
    connection = snowflake.createConnection(connOptions);

    // Add short timeout to detect stalled connections
    const connectTimeout = setTimeout(() => {
      console.error('### DEBUG ERROR: Connection attempt timed out after 60 seconds');
      reject(new Error('Connection timeout'));
    }, 10000); // Extended to 10 seconds

    // Connect to Snowflake
    console.log('### DEBUG: Connecting to Snowflake...');
    connection.connect((err) => {
      clearTimeout(connectTimeout);

      if (err) {
        console.error('### DEBUG ERROR: Error connecting to Snowflake:', err);
        console.error('### DEBUG ERROR: Connection options:', {
          account: accountName,
          username: snowflakeConfig.username,
          database: snowflakeConfig.database,
          schema: snowflakeConfig.schema
        });
        connection = null;
        reject(err);
      } else {
        console.log('### DEBUG: Successfully connected to Snowflake');

        // Try to wake up the warehouse with a simple query
        try {
          console.log('### DEBUG: Running a simple query to wake up the warehouse');

          // connection 객체가 null이 아님을 확인
          if (!connection) {
            console.error('### DEBUG ERROR: Connection is null when trying to wake up warehouse');
            resolve(null as unknown as snowflake.Connection);
            return;
          }

          connection.execute({
            sqlText: 'SELECT 1 as WAKE_UP_QUERY',
            complete: (err) => {
              if (err) {
                console.error('### DEBUG ERROR: Error running wake-up query:', err);
                // Not critical, still proceed with the connection
              } else {
                console.log('### DEBUG: Wake-up query executed successfully');
              }
              // Proceed with the connection regardless
              resolve(connection!);
            }
          });
        } catch (wakeupErr) {
          console.error('### DEBUG ERROR: Error trying to wake up warehouse:', wakeupErr);
          // Not critical, still proceed with the connection
          resolve(connection!);
        }
      }
    });
  });
}

// Execute a query on Snowflake
export async function executeQuery(
  query: string,
  binds: QueryBind[] = []
): Promise<QueryResult> {
  console.log(`### DEBUG: executeQuery called with query: ${query.substring(0, 100)}${query.length > 100 ? '...' : ''}`);
  console.log(`### DEBUG: Query binds:`, binds);

  let retries = 0;
  const maxRetries = isDevelopment() ? 1 : 2;

  while (retries <= maxRetries) {
    try {
      console.log(`### DEBUG: Getting Snowflake connection for query execution (attempt ${retries + 1})`);
      const conn = await getSnowflakeConnection();

      return new Promise((resolve, reject) => {
        // Set a timeout for the query execution
        const timeoutMs = 60000; // 60 seconds - doubled from 30 seconds
        const timeout = setTimeout(() => {
          console.error(`### DEBUG ERROR: Query execution timed out after ${timeoutMs/1000} seconds`);

          // Try to clean up
          try {
            clearConnection();
          } catch (clearErr) {
            console.error('### DEBUG ERROR: Error while clearing connection after timeout:', clearErr);
          }

          reject(new Error('Query execution timed out'));
        }, timeoutMs);

        console.log(`### DEBUG: Executing Snowflake query - timestamp: ${new Date().toISOString()}`);

        try {
          conn.execute({
            sqlText: query,
            binds: binds as snowflake.Binds,
            complete: (err, stmt, rows) => {
              clearTimeout(timeout);
              console.log(`### DEBUG: Query callback received - timestamp: ${new Date().toISOString()}`);

              if (err) {
                console.error('### DEBUG ERROR: Error executing query:', err);
                console.error('### DEBUG ERROR: SQL statement that failed:', query);
                // Check if connection issue - clear the connection
                if (err.message && (
                  err.message.includes('connection') ||
                  err.message.includes('network') ||
                  err.message.includes('timeout')
                )) {
                  console.log('### DEBUG: Clearing connection due to connection-related error');
                  clearConnection();
                }
                reject(err);
              } else {
                console.log(`### DEBUG: Query executed successfully, returned ${rows?.length || 0} rows`);
                if (rows && rows.length > 0) {
                  console.log('### DEBUG: First row sample:', JSON.stringify(rows[0]).substring(0, 100));
                } else {
                  console.log('### DEBUG: No rows returned');
                }
                resolve(rows || []);
              }
            }
          });

          console.log(`### DEBUG: Execute method called, waiting for callback - timestamp: ${new Date().toISOString()}`);
        } catch (execError) {
          clearTimeout(timeout);
          console.error('### DEBUG ERROR: Exception during query execution:', execError);
          reject(execError);
        }
      });
    } catch (error) {
      console.error(`### DEBUG ERROR: Error in executeQuery (attempt ${retries + 1}):`, error);

      // If it's the last retry, throw the error
      if (retries === maxRetries) {
        throw error;
      }

      // Otherwise, retry after a delay
      retries++;
      console.log(`### DEBUG: Retrying query execution (attempt ${retries + 1} of ${maxRetries + 1})`);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retrying
    }
  }

  // This should never happen due to the throw in the catch block above
  throw new Error('Query failed after all retries');
}

// Helper to check if we're in development mode
function isDevelopment(): boolean {
  // 항상 개발 모드가 아닌 것으로 설정 (프로덕션 모드로 강제 설정)
  return false;
}

// Check if table exists
export async function checkTableExists(): Promise<boolean> {
  console.log('### DEBUG: Checking if video_embeddings table exists');

  // In development mode, we can just assume the table doesn't exist and let the CREATE IF NOT EXISTS handle it
  if (isDevelopment()) {
    console.log('### DEBUG: In development mode - skipping table existence check');
    return false;
  }

  try {
    const query = `
      SELECT COUNT(*) as table_count
      FROM information_schema.tables
      WHERE table_schema = ?
        AND table_name = ?
    `;

    console.log('### DEBUG: About to execute table existence check query');
    const result = await executeQuery(query, [
      snowflakeConfig.schema.toUpperCase(),
      'VIDEO_EMBEDDINGS'
    ]);
    console.log('### DEBUG: Table existence check query completed');

    // Process the result safely
    let tableCount = 0;
    if (result && result.length > 0) {
      const row = result[0];
      // Handle case-insensitive field names and type safely
      tableCount = typeof row.TABLE_COUNT === 'number' ? row.TABLE_COUNT :
                  typeof row.table_count === 'number' ? row.table_count : 0;
    }

    const exists = tableCount > 0;
    console.log(`### DEBUG: video_embeddings table exists: ${exists}, count: ${tableCount}`);

    return exists;
  } catch (error) {
    console.error('### DEBUG ERROR: Error checking table existence:', error);

    // For development only - allow continuing even if check fails
    if (isDevelopment()) {
      console.warn('### DEBUG WARN: Assuming table does not exist for development');
      return false;
    }

    throw error;
  }
}

// Create video_embeddings table if it doesn't exist
export async function createTableIfNotExists(): Promise<boolean> {
  console.log('### DEBUG: Checking and creating video_embeddings table if needed');

  try {
    // For development, we can skip the check and just try to create
    let tableExists = false;

    if (!isDevelopment()) {
      try {
        tableExists = await checkTableExists();
      } catch (checkError) {
        console.error('### DEBUG ERROR: Error checking if table exists:', checkError);
        // Even in production, we can try to create the table if the check fails
        console.warn('### DEBUG WARN: Continuing with table creation despite check error');
      }
    }

    if (tableExists) {
      console.log('### DEBUG: video_embeddings table already exists');
      return true;
    }

    console.log('### DEBUG: video_embeddings table does not exist, creating it now');

    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS video_embeddings (
        VIDEO_ID VARCHAR(16777216) NOT NULL PRIMARY KEY,
        VIDEO_TITLE VARCHAR(16777216),
        CATEGORY VARCHAR(16777216),
        EMBEDDING VECTOR(FLOAT, 1024),
        METADATA VARIANT,
        CREATED_AT TIMESTAMP_NTZ(9) DEFAULT CURRENT_TIMESTAMP,
        INDEX_ID VARCHAR(255)
      )
    `;

    // In development mode, we'll just assume this succeeds
    if (isDevelopment()) {
      console.log('### DEBUG: Development mode - skipping actual table creation');
      return true;
    }

    await executeQuery(createTableQuery, []);
    console.log('### DEBUG: Successfully created video_embeddings table');

    return true;
  } catch (error) {
    console.error('### DEBUG ERROR: Error creating table:', error);

    // For development only
    if (isDevelopment()) {
      console.warn('### DEBUG WARN: Returning success despite table creation error (development mode)');
      return true;
    }

    throw error;
  }
}

// Check if embedding exists for a video in Snowflake
export async function checkEmbeddingExists(
  videoId: string,
  indexId: string
): Promise<boolean> {
  console.log(`### DEBUG: checkEmbeddingExists called for video=${videoId}, index=${indexId}`);

  // Fast return for development mode
  if (isDevelopment()) {
    const shouldExist = Math.random() > 0.75; // 25% chance to simulate existing
    console.log(`### DEBUG: Development mode - simulating embedding ${shouldExist ? 'exists' : 'does not exist'}`);
    return shouldExist;
  }

  try {
    // First ensure table exists
    await createTableIfNotExists();

    const query = `
      SELECT COUNT(*) as count
      FROM video_embeddings
      WHERE VIDEO_ID = ? AND INDEX_ID = ? AND EMBEDDING IS NOT NULL
    `;

    console.log(`### DEBUG: Executing existence check query`);
    const result = await executeQuery(query, [videoId, indexId]);
    console.log(`### DEBUG: Existence check query result:`, result);

    // Handle result safely
    let count = 0;
    if (result && result.length > 0) {
      const row = result[0];
      // Handle case-insensitive field names and type safely
      count = typeof row.COUNT === 'number' ? row.COUNT :
              typeof row.count === 'number' ? row.count : 0;
    }

    const exists = count > 0;
    console.log(`### DEBUG: Embedding exists: ${exists}, count=${count}`);

    return exists;
  } catch (error) {
    console.error('### DEBUG ERROR: Error checking embedding existence:', error);

    // Return false for development convenience (assume it doesn't exist)
    if (isDevelopment()) {
      console.warn('### DEBUG WARN: Returning false for development');
      return false;
    }

    throw error;
  }
}

// Define types for embeddings
interface EmbeddingSegment {
  embedding_option: string;
  embedding_scope: string;
  end_offset_sec: number;
  float: number[];
  start_offset_sec: number;
}

interface VideoEmbedding {
  segments: EmbeddingSegment[];
}

interface Embedding {
  model_name: string;
  video_embedding: VideoEmbedding;
  video_title?: string; // Optional title from video metadata
}

// Store embedding in Snowflake
export async function storeEmbedding(
  videoId: string,
  indexId: string,
  embedding: Embedding
): Promise<boolean> {
  console.log(`### DEBUG: storeEmbedding called for video=${videoId}, index=${indexId}`);

  // Fast return for development mode
  if (isDevelopment()) {
    console.log(`### DEBUG: Development mode - simulating successful embedding storage`);
    return true;
  }

  try {
    // First ensure table exists
    await createTableIfNotExists();

    // Then check if the embedding already exists
    console.log(`### DEBUG: Checking if embedding already exists before storing`);
    const exists = await checkEmbeddingExists(videoId, indexId);

    if (exists) {
      console.log(`### DEBUG: Embedding for video ${videoId} already exists. Skipping insertion.`);
      return true;
    }

    console.log(`### DEBUG: Embedding does not exist, proceeding with insertion`);

    // Extract the embedding vector from the first segment (assuming it's the primary one we want)
    const embeddingVector = embedding.video_embedding.segments[0]?.float || [];

    // Validate embedding vector
    if (!Array.isArray(embeddingVector) || embeddingVector.length === 0) {
      throw new Error('Invalid embedding vector: empty or not an array');
    }

    if (embeddingVector.length !== 1024) {
      console.warn(`### DEBUG WARN: Embedding vector length (${embeddingVector.length}) is not 1024`);
    }

    // Get video title from metadata if it exists
    const videoTitle = embedding.video_title || '';

    // Determine category based on index ID
    const category = indexId === process.env.NEXT_PUBLIC_ADS_INDEX_ID ? 'ad' : 'content';

    console.log(`### DEBUG: Setting category=${category} for index=${indexId}`);
    console.log(`### DEBUG: Using video title: ${videoTitle}`);

    // Store embedding vector directly, and metadata as JSON
    const query = `
      INSERT INTO video_embeddings (
        VIDEO_ID,
        VIDEO_TITLE,
        CATEGORY,
        EMBEDDING,
        METADATA,
        CREATED_AT,
        INDEX_ID
      ) VALUES (?, ?, ?, TO_VECTOR(?), PARSE_JSON(?), CURRENT_TIMESTAMP(), ?)
    `;

    // Convert embedding vector to string format for TO_VECTOR function
    const embeddingVectorString = embeddingVector.join(',');
    console.log(`### DEBUG: Embedding vector length: ${embeddingVector.length} elements`);

    // Store metadata as JSON
    const metadataString = JSON.stringify({
      model_name: embedding.model_name,
      segment_info: embedding.video_embedding.segments.map(seg => ({
        start: seg.start_offset_sec,
        end: seg.end_offset_sec,
        option: seg.embedding_option,
        scope: seg.embedding_scope
      }))
    });

    console.log(`### DEBUG: Executing insert query`);
    await executeQuery(query, [
      videoId,
      videoTitle,
      category,
      embeddingVectorString,
      metadataString,
      indexId
    ]);

    console.log(`### DEBUG: Successfully stored embedding for video ${videoId}`);
    return true;
  } catch (error) {
    console.error('### DEBUG ERROR: Error storing embedding:', error);

    // Return success for development convenience
    if (isDevelopment()) {
      console.warn('### DEBUG WARN: Returning success for development despite error');
      return true;
    }

    throw error;
  }
}