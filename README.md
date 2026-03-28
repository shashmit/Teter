# Teter

A clean, fast, and minimal code-sharing platform. Create multi-file snippets, organize them into folders, and share them effortlessly via a short link. Built with Next.js and Convex.

## 🌟 Features

- **Multi-file Editor:** Support for multiple files and folders in a single snippet.
- **Drag & Drop Organization:** Easily reorder files and folders.
- **Auto-save:** Automatically saves your work on existing snippets.
- **Instant Sharing:** Generate one-click shareable URLs.
- **View & Edit Modes:** Seamlessly toggle between reading and editing saved snippets.
- **Copy to Clipboard:** Quickly copy code from snippets.

## 💻 Tech Stack

- **Frontend:** Next.js 16, React 19, TypeScript
- **Backend & Database:** Convex
- **Styling:** CSS
- **Icons:** Lucide React

## 🚀 How to Run it Locally

Follow these steps to get a local development environment up and running.

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- A [Convex](https://www.convex.dev/) account (the free tier is perfectly fine)

### 1. Clone the repository and install dependencies

```bash
git clone https://github.com/your-username/teter.git
cd teter
npm install
```

### 2. Set up Convex

Initialize your Convex backend:

```bash
npx convex dev
```

*What this does:*
- Prompts you to log in to Convex or create an account.
- Creates a new project in your Convex dashboard.
- Generates a `.env.local` file containing your `NEXT_PUBLIC_CONVEX_URL`.
- Watches your `convex/` directory and auto-syncs any backend changes.

**Keep this command running** in a separate terminal window while you develop!

### 3. Start the Next.js development server

Open a new terminal window in the project directory and run:

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) in your browser to start using Teter!

## 🤸‍♂️ Usage Guide

1. **Create a snippet:** Use the sidebar to add files/folders, and start coding in the editor.
2. **Save:** Click the Save button to generate your shareable link.
3. **Share:** Click Share to copy the link and distribute your snippet.
4. **Edit:** Return to your saved snippet, click Edit, make your changes, and save.
5. **Delete:** Click Delete to permanently remove your snippet.

## 🤝 Contribution Guidelines

We love contributions! Whether it's fixing a bug, adding a neat feature, or improving documentation, your help is greatly appreciated.

### How to Contribute

1. **Fork the repository** on GitHub.
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/your-username/teter.git
   cd teter
   ```
3. **Create a new branch** for your feature or bugfix:
   ```bash
   git checkout -b feature/your-feature-name
   ```
4. **Make your changes** while ensuring your code follows the existing style and conventions.
5. **Test your code.** Make sure the app runs flawlessly locally (`npm run dev`) and check for linting errors (`npm run lint`).
6. **Commit your changes** with descriptive messages:
   ```bash
   git commit -m "Add feature: your great feature"
   ```
7. **Push to your branch:**
   ```bash
   git push origin feature/your-feature-name
   ```
8. **Open a Pull Request** against the `main` branch of the original repository. Describe your changes clearly and reference any related issues.

### Code of Conduct

Please be respectful and constructive when reviewing PRs or discussing issues. Our goal is to maintain a welcoming and inclusive environment for all contributors.

## 📁 Project Structure

```
src/
├── app/
│   ├── page.tsx              # Home page (new snippet)
│   ├── [id]/page.tsx         # View/edit saved snippet
│   ├── api/snippets/         # REST API routes
│   └── globals.css           # Global styles
├── components/
│   └── Editor.tsx            # Main editor component
convex/
├── schema.ts                 # Database schema definitions
└── snippets.ts               # Database queries & mutations
```

## ☁️ Deployment

Ready to take your own version live? Deploying Teter is simple.

1. Set your `NEXT_PUBLIC_CONVEX_URL` environment variable in your hosting platform (e.g., Vercel, Netlify).
2. Deploy the Convex backend:
   ```bash
   npx convex deploy
   ```
3. Build and deploy your Next.js frontend:
   ```bash
   npm run build
   ```

---

*Built with ❤️.*
