## 👋 Introduction

[Brand Integration Assistant and Ad Break Finder](https://brand-integration-assistant-public.vercel.app/ads-library) is a tool that helps you instantly understand and filter ad videos through auto-generated tags, and discover the most contextually aligned content based on a selected ad. You can even simulate ad breaks using AI-suggested insertion points and preview how your ad would appear within the content.

https://www.loom.com/share/233cc8cb66ae44218e3cff69afb772d7?sid=3646d4d4-8a31-4058-9d12-6944960bae15
## 🧱 How It Works

![alt text](/public/howItWorks.png)

## 🚀 Prerequisites

### 1. Twelve Labs API Key

If you don't have one, visit [Twelve Labs Playground](https://playground.twelvelabs.io/) to generate your API Key.

### 2.Index Ids for content videos and ads

Make sure you have two indexes for content videos and ads. If not,

- You can create the new indexes in [Twelve Labs Playground](https://playground.twelvelabs.io/)
- Or check [here](https://docs.twelvelabs.io/docs/create-indexes) on how to create an index and get the index id

### 3.Index Ids for source footage and ads

Set up a [Pinecone](https://www.pinecone.io/) account and [create an index](https://docs.informatica.com/integration-cloud/application-integration/current-version/simple-rag-consumption-with-pinecone/introduction-to-simple-rag-consumption-with-pinecone-recipe/prerequisites-for-creating-an-index-in-pinecone.html) to store video embeddings.
Make sure to set _Dimensions_ to _1024_ and _Metric_ to _Cosine_

## 🔑 Getting Started

### 1. Clone the current repo

```sh
git clone git@github.com:mrnkim/brand-integration-assistant-public.git
```

### 2. Create `.env` file in the root directory and provide the values for each key

```
TWELVELABS_API_BASE_URL=https://api.twelvelabs.io/v1.3
TWELVELABS_API_KEY=<YOUR API KEY>
NEXT_PUBLIC_CONTENT_INDEX_ID=<YOUR FOOTAGE INDEX ID>
NEXT_PUBLIC_ADS_INDEX_ID=<YOUR ADS INDEX ID>
PINECONE_API_KEY=<YOUR API KEY>
PINECONE_INDEX=<YOUR INDEX NAME>
```

### 3. Run the development server

```bash
npm install
npm run dev
```

### 4. Open [http://localhost:3000](http://localhost:3000) with your browser
