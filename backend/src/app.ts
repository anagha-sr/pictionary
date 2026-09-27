import express from "express";
import router from "./routes/index";
import cors from "cors";
import "dotenv/config";

const app = express();
app.use(cors({
   origin: "http://localhost:5173"
}));
app.use(express.json());


app.get("/", (req, res) => {
  res.json({ message: "API is running" });
});

app.use(router);

export default app;