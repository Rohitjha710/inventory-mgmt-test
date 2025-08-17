const express = require('express');
const path = require('path');
const fs = require("fs");
const jwt = require("jsonwebtoken");
const JWT_SECRET = "supersecretkey";

const users = [
    { username: "anvesh@takla.in", password: "qwerty987@987", role: "admin" },
    { username: "staff@gariyaband.in", password: "qwerty987@987", role: "staff" }
  ];
  

const app = express();
const PORT = process.env.PORT || 3000;

// Set EJS as the view engine
app.set('view engine', 'ejs');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Set views directory
app.set('views', path.join(__dirname, 'views'));

// Serve static files (CSS, JS, images)
app.use(express.static(path.join(__dirname, 'public')));


const DATA_FILE = path.join(__dirname, "inventory.json");

// Helper to read JSON
function readInventory() {
  try {
    const data = fs.readFileSync(DATA_FILE, "utf8");
    return JSON.parse(data);
  } catch (err) {
    return [];
  }
}

// Helper to write JSON
function writeInventory(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

const BILLS_FILE = path.join(__dirname, "bills.json");

function readBills() {
  try {
    return JSON.parse(fs.readFileSync(BILLS_FILE, "utf8"));
  } catch (err) {
    return [];
  }
}

function writeBills(data) {
  fs.writeFileSync(BILLS_FILE, JSON.stringify(data, null, 2), "utf8");
}

function authenticateToken(req, res, next) {
    let token = null;
  
    // Try header first (API requests)
    if (req.headers["authorization"]) {
      token = req.headers["authorization"].split(" ")[1];
    }
  
    // Try query param (browser GET request)
    if (!token && req.query.token) {
      token = req.query.token;
    }
  
    if (!token) return res.redirect('/login');
  
    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) return res.redirect('/login'); // redirect instead of 403
      req.user = user;
      next();
    });
  }
  
  
  function authorizeRoles(...roles) {
    return (req, res, next) => {
      if (!roles.includes(req.user.role)) {
        return res.status(403).json({ error: "Access denied" });
      }
      next();
    };
  }
  

// Routes
app.get('/', (req, res) => {
    res.render('index', { title: 'Home Page' });
});
app.get('/login', (req, res) => {
    res.render('login');
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === password);
  
    if (!user) {
      return res.send(`
        <script>
          alert("Invalid credentials");
          window.location.href = "/login";
        </script>
      `);
    }
  
    const token = jwt.sign({ username: user.username, role: user.role }, JWT_SECRET, { expiresIn: "1h" });
  
    // Save token and role, then redirect to dashboard
    res.send(`
        <script>
          const token = "${token}";
          localStorage.setItem("token", token);
          localStorage.setItem("role", "${user.role}");
          alert("Login successful!");
          window.location.href = "/dashboard?token=" + token;
        </script>
      `);
      
  });
  
  
// Dashboard route
// Mock inventory data
// const inventoryData = [
//     { id: 1, name: 'Product 1', quantity: 10, price: 100 },
//     { id: 2, name: 'Product 2', quantity: 5, price: 200 },
//     { id: 3, name: 'Product 3', quantity: 20, price: 150 },
//     { id: 4, name: 'Product 4', quantity: 8, price: 300 },
//     { id: 5, name: 'Product 5', quantity: 15, price: 250 }
// ];
  
  // Dashboard with inventory
  app.get('/dashboard',authenticateToken, (req, res) => {
    if (!['admin', 'staff'].includes(req.user.role)) {
        return res.redirect('/login');
      }
    const items = readInventory();
    res.render('dashboard', { username: 'Rohit Jha', items });
  });

  app.post("/items", (req, res) => {
    const items = readInventory();
    const { name, qty } = req.body;
  
    if (items.find(i => i.name === name)) {
      return res.status(400).json({ error: "Item already exists" }); // JSON
    }
  
    items.push({ name, qty: Number(qty) });
    writeInventory(items);
  
    res.json({ success: true, items }); // ✅ JSON response
  });
  
  app.post("/items/update", (req, res) => {
    const items = readInventory();
    const { name, addUnits } = req.body;
  
    const item = items.find(i => i.name === name);
    if (!item) return res.status(404).json({ error: "Item not found" });
  
    item.qty += Number(addUnits);
    writeInventory(items);
  
    res.json({ success: true, items }); // ✅ JSON response
  });
  
  
  const PDFDocument = require("pdfkit");
  app.post("/bills", (req, res) => {
    try {
      const { items, total } = req.body;
  
      // Read inventory
      const inventory = readInventory();
  
      // Deduct quantity from inventory
      items.forEach(billItem => {
        const invItem = inventory.find(i => i.name === billItem.name);
        if (invItem) {
          invItem.qty -= billItem.qty;
          if (invItem.qty < 0) invItem.qty = 0; // prevent negative
        }
      });
  
      // Save updated inventory
      writeInventory(inventory);
  
      // Save bill
      const bills = readBills();
      const newBill = {
        id: Date.now(),
        date: new Date().toISOString(),
        items,
        total
      };
      bills.push(newBill);
      writeBills(bills);
  
      res.json({ success: true, bill: newBill });
  
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, error: "Failed to save bill" });
    }
  });
  
  
  
// GET /bills/pdf/:id
app.get("/bills/pdf/:id", (req, res) => {
    const bills = readBills();
    const bill = bills.find(b => b.id == req.params.id);
    if (!bill) return res.status(404).json({ error: "Bill not found" });
  
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=${bill.id}.pdf`);
  
    const doc = new PDFDocument({ margin: 30, size: 'A4' });
    doc.pipe(res);
    // Title
    doc.fontSize(20).text("Bill Receipt", { align: "center" }).moveDown(1);
  
    // Column positions
    const startX = 50;
    const colItem = startX;
    const colQty = 300;
    const colPrice = 370;
    const colTotal = 450;
  
    // Headers
    doc.fontSize(12).font("Helvetica-Bold");
    doc.text("Item", colItem, doc.y);
    doc.text("Qty", colQty, doc.y);
    doc.text("Price", colPrice, doc.y);
    doc.text("Total", colTotal, doc.y);
    doc.moveDown(0.5);
    doc.moveTo(startX, doc.y).lineTo(520, doc.y).stroke();
    doc.moveDown(0.5);
  
    // Rows
    doc.font("Helvetica");
    bill.items.forEach(item => {
      const total = item.qty * item.price;
      doc.text(item.name, colItem, doc.y);
      doc.text(item.qty.toString(), colQty, doc.y);
      doc.text(item.price.toString(), colPrice, doc.y);
      doc.text(total.toString(), colTotal, doc.y);
      doc.moveDown(0.5);
    });
  
    doc.moveDown(1);
    doc.font("Helvetica-Bold").text(`Grand Total: ₹${bill.total}`, colTotal, doc.y, { align: "right" });
  
    doc.end();
  });
  

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});