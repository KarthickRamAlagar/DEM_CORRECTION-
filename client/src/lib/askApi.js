const BASE_URL = "http://localhost:8000/api/ask";

export async function askQuestion(question) {
  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || "Something went wrong.");
  }
  return data;
}