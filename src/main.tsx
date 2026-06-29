import { render } from "preact";
import { App } from "./App";
import { installDocumentLinkHandler, navigate, normalizePath } from "./router";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/responsive.css";
import "./styles/figma-v1.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root element not found");

if (window.location.pathname === "/") navigate("/home", true);
else if (normalizePath(window.location.pathname) !== window.location.pathname) navigate(normalizePath(window.location.pathname), true);

installDocumentLinkHandler();
render(<App />, root);
