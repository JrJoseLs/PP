import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/app.css";

if (/[?&]demo\b/.test(location.search)) sessionStorage.setItem("pp_force_demo", "1");

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
