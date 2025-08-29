const API_BASE =
  "https://script.google.com/macros/s/AKfycbwkc8pkgsIwumXLAXsXcr0BZv07VHRagHDhQTWPWzqPUQNgiM_DtKbV1cNR2tFSJ3mZ/exec";

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.style.display = "block";
  setTimeout(() => {
    t.style.display = "none";
  }, 2600);
}

async function sendOrder(payload) {
  try {
    // Enviar como application/x-www-form-urlencoded (sin poner headers)
    const body = new URLSearchParams({
      item: String(payload.item || ""),
      quantity: String(payload.quantity || 1),
      notes: String(payload.notes || ""),
      price: String(payload.price || ""),
    });

    const res = await fetch(API_BASE, {
      method: "POST",
      body, // no pongas headers Content-Type 😉
    });

    const data = await res
      .json()
      .catch(() => ({ ok: false, error: "No se pudo leer JSON" }));
    if (!data.ok)
      throw new Error(data.error || data.message || "Error desconocido");
    showToast("✅ Pedido registrado");
  } catch (err) {
    console.error(err);
    showToast("❌ " + err.message);
  }
}

// Botones rápidos
document.querySelectorAll(".quick-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const item = btn.dataset.item;
    sendOrder({ item, quantity: 1, notes: "", price: "" });
  });
});

// Formulario personalizado
document.getElementById("sendOrder").addEventListener("click", () => {
  const item = document.getElementById("item").value.trim();
  const quantity = parseInt(
    document.getElementById("quantity").value || "1",
    10
  );
  const price = document.getElementById("price").value;
  const notes = document.getElementById("notes").value;
  sendOrder({ item, quantity, notes, price });
});
