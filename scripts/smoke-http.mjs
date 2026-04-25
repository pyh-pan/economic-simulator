const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:5173";

async function assertOk(path, expected) {
  const response = await fetch(`${baseUrl}${path}`);
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}`);
  }
  const body = await response.text();
  if (expected && !body.includes(expected)) {
    throw new Error(`${path} did not include ${expected}`);
  }
  return response.status;
}

await assertOk("/", "Economic Simulator");
await assertOk("/src/ui/main.jsx", "createRoot");

console.log(`HTTP smoke passed: ${baseUrl}`);
