# Teter

A clean, minimal code sharing platform. Create multi-file snippets, organize them into folders, and share them via a short link. Built with Next.js and Convex.

## Features

- Multi-file editor with folder support
- Drag and drop to reorganize files and folders
- Auto-save on existing snippets
- One-click sharing via short links
- Toggle between view and edit mode on saved snippets
- Copy code to clipboard

## Tech Stack

- **Frontend:** Next.js 16, React 19, TypeScript
- **Backend/Database:** Convex
- **Icons:** Lucide React

## Getting Started

### Prerequisites

- Node.js 18+
- A [Convex](https://www.convex.dev/) account (free tier works)

### 1. Install dependencies

```bash
npm install
```

### 2. Set up Convex

```bash
npx convex dev
```

This will prompt you to log in to Convex (or create an account), create a new project, and deploy the schema. It will also generate a `.env.local` file with your `NEXT_PUBLIC_CONVEX_URL`.

Keep this running in a terminal — it watches for schema/function changes and deploys them automatically.

### 3. Start the dev server

In a separate terminal:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to use Teter.

### 4. Usage

1. **Create a snippet** — Add files and folders in the sidebar, write your code in the editor.
2. **Save** — Click the Save button. You'll be redirected to a shareable URL.
3. **Share** — Click Share to copy the link to your clipboard.
4. **Edit** — On a saved snippet, click Edit to modify files and content, then Save again.
5. **Delete** — Click Delete to remove a snippet permanently.

## Project Structure

```
src/
├── app/
│   ├── page.tsx              # Home page (new snippet)
│   ├── [id]/page.tsx         # View/edit saved snippet
│   ├── api/snippets/         # REST API routes
│   ├── layout.tsx
│   └── globals.css
├── components/
│   └── Editor.tsx            # Main editor component
convex/
├── schema.ts                 # Database schema
└── snippets.ts               # Database queries & mutations
```

## Deployment

Deploy the Next.js app to Vercel or any Node.js host. Make sure to set the `NEXT_PUBLIC_CONVEX_URL` environment variable in your hosting provider.

```bash
npx convex deploy
npm run build
```
