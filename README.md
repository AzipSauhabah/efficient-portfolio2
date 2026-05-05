# 📊 Efficient Portfolio 2

A modern fullstack financial web application for portfolio optimization, built with a serverless FastAPI backend and a React + TypeScript frontend.

It allows users to manage multiple portfolios, optimize asset allocation using Modern Portfolio Theory (Markowitz), visualize the efficient frontier, and export results as PDF reports.

---

## ✨ Features

- Portfolio optimization (risk / return trade-off)
- Efficient frontier visualization
- Multi-portfolio management
- Real-time market data via yfinance
- Fast React + Vite frontend
- PDF export of portfolio analysis
- Serverless backend deployed on Vercel

---

## 🏗️ Architecture

efficient-portfolio2/
│
├── api/
│   └── index.py              # FastAPI backend (serverless)
│
├── src/
│   ├── App.tsx              # Main dashboard
│   ├── main.tsx
│   ├── hooks/
│   │   └── useApi.ts        # API calls
│   ├── types/
│   │   └── index.ts         # TypeScript types
│   └── utils/
│       └── pdfExport.ts     # PDF export logic
│
├── index.html
├── package.json
├── vite.config.ts
├── vercel.json
├── requirements.txt
└── README.md

---

## 🛠️ Tech Stack

Backend:
- FastAPI (Python)
- yfinance
- NumPy / Pandas
- Markowitz optimization

Frontend:
- React
- TypeScript
- Vite
- Custom hooks
- PDF export utility

Deployment:
- Vercel (serverless backend + frontend)

---

## 🚀 Installation

Clone repository:

git clone https://github.com/AzipSauhabah/efficient-portfolio2.git
cd efficient-portfolio2

---

Backend setup:

python -m venv venv
source venv/bin/activate
venv\Scripts\activate

pip install -r requirements.txt

uvicorn api.index:app --reload

---

Frontend setup:

npm install
npm run dev

---

## 📡 API Endpoints

GET /           → Health check  
POST /optimize  → Portfolio optimization  
POST /prices    → Market data  
POST /portfolio → Portfolio management  

---

## 📄 PDF Export

File:
src/utils/pdfExport.ts

Generates:
- allocation summary
- performance metrics
- report export

---

## 🌐 Deployment

Configured with Vercel:

vercel.json

Supports:
- FastAPI serverless functions
- Static Vite frontend

---

## 📌 Roadmap

- Authentication system
- Database persistence
- Advanced charts
- Backtesting engine
- Trading simulation

---

## 👤 Author

Azip Sauhabah  
GitHub: https://github.com/AzipSauhabah

---

## 📄 License

GNU License.
