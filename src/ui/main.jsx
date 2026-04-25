import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import "./App.css";

createRoot(document.querySelector("#root")).render(<App />);
