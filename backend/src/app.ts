import express from "express";
import cors from "cors";

import apiRouter from "./routes/api";

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Mount all routes from api.ts at root
app.use("/api/v1", apiRouter);

export default app;
