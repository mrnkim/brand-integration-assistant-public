This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Environment Variables

Copy the `src/env.example` file to a new file called `.env.local` in the root directory and fill in your actual credentials:

```bash
cp src/env.example .env.local
```

## Snowflake Integration

This application integrates with Snowflake to store and retrieve video embeddings. Follow these steps to set up your Snowflake environment:

1. **Install Snowflake SDK**:

   ```bash
   npm install snowflake-sdk
   ```

2. **Setup Snowflake Database**:
   Run the SQL script in `scripts/setup-snowflake.sql` in your Snowflake console to create the required database, schema, and tables.

3. **Configure Environment Variables**:
   Make sure to set the following Snowflake connection parameters in your `.env.local` file:

   ```
   SNOWFLAKE_ACCOUNT=your_account_id.your_region
   SNOWFLAKE_USERNAME=your_username
   SNOWFLAKE_PASSWORD=your_password
   SNOWFLAKE_DATABASE=BRAND_INTEGRATION_DB
   SNOWFLAKE_SCHEMA=EMBEDDINGS
   SNOWFLAKE_WAREHOUSE=COMPUTE_WH
   ```

4. **Development Mode**:
   If Snowflake credentials are not properly configured, the application will use fallback mock responses in development mode to allow continued development.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
