# Secure Vercel deployment

Do not place a Vercel token in this folder or commit one to GitHub.

## Interactive Vercel login
```bash
npm install
npm run build
npx vercel login
npx vercel --prod
```

## GitHub-linked deployment
Copy these files to the configured Vercel project root in the existing GitHub repository, commit, and push to the production branch.
