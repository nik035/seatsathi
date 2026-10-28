// ─────────────────────────────────────────────────────────────
// SeatSathi configuration
// 1. Paste your Firebase web-app config below (see README → "Connect Firebase").
//    While apiKey is empty the site runs in DEMO MODE: everything works,
//    but data is saved only in the visitor's own browser.
// 2. Put your Google email in ADMIN_EMAILS to unlock the admin dashboard.
//    (Use the same email in firestore.rules.)
// ─────────────────────────────────────────────────────────────

export const FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

export const ADMIN_EMAILS = [
  // "you@gmail.com"
];

export const APP_NAME = "SeatSathi";

// Days before the due date when a member is shown as "due soon"
export const DUE_SOON_DAYS = 3;

// Cities with pre-built news feeds (the GitHub Action refreshes these every 3 hours)
export const NEWS_CITIES = [
  "Jaipur", "Lucknow", "Delhi", "Mumbai", "Kota", "Patna", "Prayagraj", "Indore",
  "Bhopal", "Varanasi", "Kanpur", "Bengaluru", "Hyderabad", "Chennai", "Kolkata",
  "Pune", "Ahmedabad", "Chandigarh", "Dehradun", "Jodhpur", "Udaipur", "Ajmer",
  "Bikaner", "Gorakhpur", "Agra", "Noida", "Gurugram", "Ranchi", "Bhubaneswar", "Guwahati"
];
export const NEWS_COUNTRIES = [
  "India", "United States", "China", "United Kingdom", "Russia", "Pakistan",
  "Bangladesh", "Nepal", "Japan", "Australia", "Canada", "Israel", "Ukraine", "Sri Lanka"
];
export const NEWS_TOPICS = ["Economy", "Science", "Sports", "Government schemes", "Defence", "Environment", "Exams and jobs"];
