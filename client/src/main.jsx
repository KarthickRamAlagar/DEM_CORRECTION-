import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import App from "./App.jsx";
import DeviceGate from "./components/DeviceGate.jsx";
import "./index.css";

// TanStack Query added for pages that talk to the real backend (starting
// with the EDA page) - existing pages that don't use useQuery are
// completely unaffected by this, it only adds new capability.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 min - this is precomputed data, doesn't change often
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <DeviceGate>
      <QueryClientProvider client={queryClient}>
        <App />
      
        {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
      </QueryClientProvider>
    </DeviceGate>
  </React.StrictMode>
);