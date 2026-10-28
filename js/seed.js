// Sample data for demo mode only. Never used once Firebase is connected.
import { today, addDays, addMonths, iso } from "./util.js";

export function seedDemo() {
  let s = 42;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const T = today();
  const now = Date.now();
  const day = 86400000;

  const first = ["Aarav", "Priya", "Rohit", "Sneha", "Vikram", "Anjali", "Karan", "Pooja", "Aditya", "Neha", "Rahul", "Kavya",
    "Saurabh", "Divya", "Manish", "Shreya", "Ankit", "Simran", "Deepak", "Nikita", "Gaurav", "Megha", "Harsh", "Tanvi",
    "Sumit", "Ritika", "Abhishek", "Payal", "Yash", "Komal", "Vivek", "Jyoti", "Ravi", "Sakshi", "Ajay", "Muskan"];
  const last = ["Sharma", "Meena", "Verma", "Yadav", "Gupta", "Choudhary", "Jain", "Singh", "Saini", "Agarwal", "Kumawat", "Mishra", "Rathore", "Tiwari"];
  const phone = () => "9" + String(Math.floor(rnd() * 1e9)).padStart(9, "0");

  const db = { users: {}, libraries: {}, memberships: {}, payments: {}, reviews: {} };

  const libs = [
    {
      id: "lib-demo", ownerId: "demo-owner", name: "Saraswati Self Study Library", area: "Malviya Nagar", city: "Jaipur",
      address: "Plot 14, Sector 3, near Gaurav Tower, Malviya Nagar, Jaipur 302017", lat: 26.8530, lng: 75.8053,
      phone: "9829000001", totalSeats: 48, cols: 8, hours: "6:00 AM – 10:00 PM",
      plans: [{ name: "Full day", hours: "6 AM – 10 PM", price: 900 }, { name: "Morning", hours: "6 AM – 2 PM", price: 600 }, { name: "Evening", hours: "2 PM – 10 PM", price: 600 }],
      facilities: ["AC", "Wi-Fi", "Power socket at desk", "Personal locker", "Drinking water (RO)", "CCTV", "Washroom", "Separate girls' section", "Power backup"],
      about: "Quiet, fully air-conditioned hall with 48 individual desks, each with a lamp and charging socket. Popular with RAS, SSC and banking aspirants.",
      upi: "demo-owner@upi", payeeName: "Mahesh Gupta", bank: { holder: "Mahesh Gupta", bank: "State Bank of India", acc: "XXXXXXXX4321", ifsc: "SBIN0000000" },
      billing: "joining", dueDay: 5, graceDays: 5, autoReleaseDays: 20,
      notices: [{ at: now - 2 * day, text: "Library stays open on Diwali, 6 AM – 2 PM only." }],
    },
    {
      id: "lib-lakshya", ownerId: "seed-owner-1", name: "Lakshya Library", area: "Vaishali Nagar", city: "Jaipur",
      address: "B-21, Amrapali Marg, Vaishali Nagar, Jaipur 302021", lat: 26.9110, lng: 75.7430, phone: "9829000002",
      totalSeats: 60, cols: 10, hours: "Open 24×7",
      plans: [{ name: "24 hours", hours: "Any time", price: 1200 }, { name: "Day", hours: "7 AM – 7 PM", price: 800 }],
      facilities: ["AC", "Wi-Fi", "Personal locker", "Drinking water (RO)", "CCTV", "Open 24×7", "Parking", "Tea/coffee"],
      about: "24-hour reading hall with cabins, lockers and a tea corner.", upi: "lakshya@upi", payeeName: "Lakshya Library",
      bank: { holder: "Lakshya Library", bank: "HDFC Bank", acc: "XXXXXXXX1188", ifsc: "HDFC0000000" }, billing: "fixed", dueDay: 1, graceDays: 5, notices: [],
    },
    {
      id: "lib-pathshala", ownerId: "seed-owner-2", name: "Pathshala Reading Room", area: "Aliganj", city: "Lucknow",
      address: "Sector H, Aliganj, Lucknow 226024", lat: 26.8920, lng: 80.9410, phone: "9415000003",
      totalSeats: 40, cols: 8, hours: "6:00 AM – 11:00 PM",
      plans: [{ name: "Full day", hours: "6 AM – 11 PM", price: 800 }, { name: "Half day", hours: "6 hours", price: 500 }],
      facilities: ["Wi-Fi", "Drinking water (RO)", "CCTV", "Washroom", "Newspapers & magazines", "Silent zone", "Power backup"],
      about: "Budget-friendly hall near Kapoorthala crossing with daily newspapers in Hindi and English.", upi: "pathshala@upi", payeeName: "Pathshala",
      bank: { holder: "R K Tiwari", bank: "Punjab National Bank", acc: "XXXXXXXX7702", ifsc: "PUNB0000000" }, billing: "fixed", dueDay: 10, graceDays: 3, notices: [],
    },
    {
      id: "lib-hub", ownerId: "seed-owner-3", name: "The Study Hub", area: "Gomti Nagar", city: "Lucknow",
      address: "Vibhuti Khand, Gomti Nagar, Lucknow 226010", lat: 26.8600, lng: 81.0050, phone: "9415000004",
      totalSeats: 72, cols: 12, hours: "Open 24×7",
      plans: [{ name: "24 hours", hours: "Any time", price: 1500 }, { name: "Night", hours: "8 PM – 8 AM", price: 900 }],
      facilities: ["AC", "Wi-Fi", "Power socket at desk", "Personal locker", "Drinking water (RO)", "CCTV", "Washroom", "Open 24×7", "Discussion room", "Charging point"],
      about: "Large AC hall with ergonomic chairs and a separate discussion room.", upi: "studyhub@upi", payeeName: "The Study Hub",
      bank: { holder: "Study Hub LLP", bank: "ICICI Bank", acc: "XXXXXXXX5530", ifsc: "ICIC0000000" }, billing: "joining", graceDays: 5, notices: [],
    },
    {
      id: "lib-ekagra", ownerId: "seed-owner-4", name: "Ekagra Library", area: "Talwandi", city: "Kota",
      address: "Road No. 1, Talwandi, Kota 324005", lat: 25.1460, lng: 75.8460, phone: "9414000005",
      totalSeats: 50, cols: 10, hours: "5:00 AM – 12:00 AM",
      plans: [{ name: "Full day", hours: "5 AM – 12 AM", price: 1000 }],
      facilities: ["AC", "Wi-Fi", "Drinking water (RO)", "CCTV", "Separate girls' section", "Silent zone"],
      about: "Silent study hall close to the coaching belt.", upi: "ekagra@upi", payeeName: "Ekagra Library",
      bank: { holder: "Ekagra Library", bank: "Bank of Baroda", acc: "XXXXXXXX2209", ifsc: "BARB0000000" }, billing: "joining", graceDays: 5, notices: [],
    },
  ];

  libs.forEach((l, i) => {
    const { id, ...rest } = l;
    db.libraries[id] = { ...rest, status: "active", createdAt: now - (170 - i * 30) * day };
    db[`libraries/${id}/seats`] = {};
  });

  // Users
  db.users["demo-owner"] = { role: "owner", name: "Mahesh Gupta", email: "owner@demo.seatsathi", phone: "9829000001", city: "Jaipur", createdAt: now - 170 * day };
  db.users["demo-admin"] = { role: "admin", name: "Site Admin", email: "admin@demo.seatsathi", createdAt: now - 180 * day };
  db.users["demo-student"] = {
    role: "student", name: "Riya Sharma", email: "student@demo.seatsathi", phone: "9876500012", city: "Jaipur",
    area: "Malviya Nagar", lat: 26.8550, lng: 75.8120, exam: "RAS", createdAt: now - 95 * day,
    news: { on: true, scope: "city", place: "Jaipur" },
  };
  for (let i = 1; i <= 4; i++) db.users[`seed-owner-${i}`] = { role: "owner", name: `${pick(first)} ${pick(last)}`, email: `owner${i}@example.com`, city: libs[i].city, createdAt: libs[i] && now - (140 - i * 30) * day };
  for (let i = 0; i < 64; i++) {
    db.users[`seed-stu-${i}`] = { role: "student", name: `${pick(first)} ${pick(last)}`, email: `s${i}@example.com`, city: pick(["Jaipur", "Jaipur", "Lucknow", "Lucknow", "Kota"]), createdAt: now - Math.floor(rnd() * 175) * day };
  }

  // Members of the demo owner's library
  const L = db.libraries["lib-demo"];
  const seats = [...Array(L.totalSeats)].map((_, i) => String(i + 1));
  const taken = seats.filter(() => rnd() < 0.78);
  if (!taken.includes("12")) taken.push("12");
  taken.forEach((seat) => {
    const isRiya = seat === "12";
    const plan = isRiya ? L.plans[0] : pick(L.plans);
    const monthsIn = isRiya ? 3 : 1 + Math.floor(rnd() * 6);
    const joined = addDays(T, -(monthsIn * 30 + Math.floor(rnd() * 20)));
    let nextDue = addMonths(joined, monthsIn);
    // spread due dates so the dashboard shows every state
    if (!isRiya) nextDue = addDays(T, Math.floor(rnd() * 44) - 16);
    else nextDue = addDays(T, 2);
    const uid = isRiya ? "demo-student" : null;
    const mid = isRiya ? "mem-riya" : "mem-" + seat;
    db.memberships[mid] = {
      libraryId: "lib-demo", ownerId: "demo-owner", studentId: uid,
      name: isRiya ? "Riya Sharma" : `${pick(first)} ${pick(last)}`, phone: isRiya ? "9876500012" : phone(),
      seat, plan: plan.name, fee: plan.price, joinedOn: joined, nextDue, status: "active",
      source: isRiya ? "app" : rnd() < 0.3 ? "app" : "walk-in", createdAt: parseInt(now - daysAgo(joined) * day),
    };
    db["libraries/lib-demo/seats"][seat] = { state: "taken", uid: uid || "walkin", libraryId: "lib-demo" };
    // payment history
    let d = nextDue;
    for (let k = 0; k < monthsIn; k++) {
      d = addMonths(d, -1);
      if (d < joined) break;
      db.payments[`pay-${seat}-${k}`] = {
        libraryId: "lib-demo", ownerId: "demo-owner", membershipId: mid, studentId: uid, name: db.memberships[mid].name,
        amount: plan.price, months: 1, periodFrom: d, method: pick(["UPI", "UPI", "UPI", "Cash", "Bank transfer"]),
        utr: "", status: "confirmed", paidOn: addDays(d, Math.floor(rnd() * 4)), createdAt: Date.parse(d), confirmedAt: Date.parse(d),
      };
    }
  });
  function daysAgo(isoStr) { return Math.round((Date.parse(T) - Date.parse(isoStr)) / day); }

  // Two new bookings waiting for the owner to confirm the payment
  const free = seats.filter((x) => !taken.includes(x));
  [["Arjun Meena", "9001200034"], ["Khushi Jain", "9001200056"]].forEach(([name, ph], i) => {
    const seat = free[i]; if (!seat) return;
    const mid = "mem-new-" + i;
    db.memberships[mid] = { libraryId: "lib-demo", ownerId: "demo-owner", studentId: `seed-stu-${i}`, name, phone: ph, seat, plan: "Full day", fee: 900, joinedOn: T, nextDue: null, status: "pending", source: "app", createdAt: now - (i + 1) * 3600000 };
    db["libraries/lib-demo/seats"][seat] = { state: "held", uid: `seed-stu-${i}`, libraryId: "lib-demo" };
    db.payments["pay-new-" + i] = { libraryId: "lib-demo", ownerId: "demo-owner", membershipId: mid, studentId: `seed-stu-${i}`, name, amount: 900, months: 1, periodFrom: T, method: "UPI", utr: String(4100000000 + Math.floor(rnd() * 99999999)), status: "claimed", paidOn: T, createdAt: now - i * 1800000 };
  });

  // Other libraries: just occupied seats
  libs.slice(1).forEach((l) => {
    for (let i = 1; i <= l.totalSeats; i++) if (rnd() < 0.7) db[`libraries/${l.id}/seats`][String(i)] = { state: "taken", uid: "walkin", libraryId: l.id };
  });
  // Make Ekagra full, to show the waitlist
  for (let i = 1; i <= 50; i++) db["libraries/lib-ekagra/seats"][String(i)] = { state: "taken", uid: "walkin", libraryId: "lib-ekagra" };

  // Reviews
  const texts = ["Very quiet, AC works well even in May.", "Owner is helpful, lockers are clean.", "Good place but washroom could be cleaner.", "Wi-Fi is fast. Seats are comfortable for long hours.", "Best library in the area for the price.", "Crowded in exam season, book early."];
  libs.forEach((l) => {
    const n = 2 + Math.floor(rnd() * 4);
    for (let i = 0; i < n; i++) db.reviews[`rev-${l.id}-${i}`] = { libraryId: l.id, studentId: `seed-stu-${i}`, name: `${pick(first)} ${pick(last).charAt(0)}.`, rating: 3 + Math.floor(rnd() * 3), text: pick(texts), createdAt: now - Math.floor(rnd() * 60) * day };
  });

  db.visits = {};
  for (let d = 0; d < 14; d++) {
    const n = 18 + Math.floor(rnd() * 30) + d * 2;
    for (let i = 0; i < n; i++) db.visits[`v-${d}-${i}`] = { day: addDays(T, d - 13), role: pick(["guest", "guest", "student", "student", "owner"]), at: now };
  }

  db["libraries/lib-ekagra/waitlist"] = { "seed-stu-9": { name: "Tanvi Saini", phone: "9001200078", createdAt: now - 2 * day } };
  return db;
}
