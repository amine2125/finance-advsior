import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import { App } from "./App";
import { MotionRoot } from "./components/motion";

createRoot(document.getElementById("root")!).render(
  <StrictMode><MotionRoot><BrowserRouter><App /></BrowserRouter></MotionRoot></StrictMode>,
);
