# Farmotics Web

Web dashboard for **Farmotics**, an AI-powered drone system for early pest and insect detection in agriculture.
It lets farmers view their farms on a map, see where infestations were detected, read reports, and receive alerts.

## Team

Web Frontend team:

- Menatallah
- Jana

## Tech Stack

- React
- Vite
- Planned: Axios (API calls), React Router (navigation), Leaflet (maps), Chart.js (reports)

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (LTS version)
- [Git](https://git-scm.com/)

### Run the project locally

```bash
git clone https://github.com/menna20060/farmotics-web.git
cd farmotics-web
npm install
npm run dev
```

Then open the local address shown in the terminal (usually `http://localhost:5173`).

## Project Structure

```
src/
├── components/   Reusable UI parts (buttons, cards, navbar)
├── pages/        Application screens (Login, Dashboard, ...)
├── services/     API communication (Axios)
├── assets/       Images and logos
└── styles/       Global styles
```

## Contributing

- Do not work directly on `main`. Create a branch for each task:
  `git checkout -b feature/your-task-name`
- Open a Pull