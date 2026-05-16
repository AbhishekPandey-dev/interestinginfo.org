# Interesting Information Christian Ministry — Document Viewer

A modern, high-fidelity web application tailored to effortlessly deliver and interact with `.docx` literature straight in the browser. Designed with readability, accessibility, and AI intelligence in mind.

## ✨ Features

- **High-Fidelity Document Viewer**: Upload any `.docx` file via the admin panel and automatically render it for readers exactly how they'd see it in Google Docs or Microsoft Word.
- **Word-Style Zoom Architecture**: Smooth panning and zooming from `50%` to `300%`. Rather than simply scaling font sizes, the viewport applies CSS transformations along with a logical-width architecture, ensuring text reflows accurately and never clips.
- **Reading Mode**: A single-click toggle applying an amber, warm-tinted overlay (`mixBlendMode: multiply`) that dramatically reduces eye strain during long reading sessions without disrupting the project's native layout.
- **Text-to-Speech (TTS) Selection**: Simply highlight any text on the page to spawn a dynamic floating tooltip allowing users to immediately read the excerpt aloud, complete with Play/Pause and Stop functionality.
- **Integrated AI Assistant**: An overlay assistant that interacts with the rendered document, creating summaries or answering questions in real-time.
- **Admin Dashboard**: A secure backend where administrators can easily drag-and-drop `.docx` files, manage what document is currently "Published" to the public audience, download source files, or edit documents via WYSIWYG.

## 🛠 Tech Stack

- **Frontend Framework**: [React 18](https://react.dev/) / [Vite](https://vitejs.dev/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) / [shadcn/ui](https://ui.shadcn.com/)
- **Database & Auth**: [Supabase](https://supabase.com/) (PostgreSQL, Storage, Auth)
- **Document Rendering**: `docx-preview` / `mammoth`
- **Routing**: `react-router-dom`

## 🚀 Getting Started

### Prerequisites

You need Node.js (v18+ recommended) and `npm` installed. You will also need a Supabase project created for your backend services.

## 🔒 Security & Admin

The admin page `/admin` uses Supabase Auth to ensure only authorized administrators can upload and publish new texts. Ensure row-level security (RLS) is appropriately matched on your `published_document` Supabase table and `documents` storage bucket!
