// URL de tu Apps Script /exec
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
function setLoading(on) {
  const l = document.getElementById("loader");
  if (l) l.style.display = on ? "block" : "none";
}

// Envío sin preflight (form-urlencoded)
async function sendOrder(payload) {
  try {
    if (!payload.item || String(payload.item).trim() === "") {
      showToast("❌ Falta el item.");
      return;
    }
    const body = new URLSearchParams({
      item: String(payload.item || ""),
      quantity: String(payload.quantity || 1),
      notes: String(payload.notes || ""),
      price: String(payload.price || ""),
    });
    setLoading(true);
    const res = await fetch(API_BASE, { method: "POST", body });
    const data = await res
      .json()
      .catch(() => ({ ok: false, error: "Respuesta inválida" }));
    if (!data.ok)
      throw new Error(data.error || data.message || "Error desconocido");
    showToast("✅ Pedido registrado");
  } catch (err) {
    console.error(err);
    showToast("❌ " + err.message);
  } finally {
    setLoading(false);
  }
}

// Inicializa cada tarjeta de producto
function setupProductCard(card) {
  const price = parseFloat(card.dataset.price || "0");
  const item = card.dataset.item || "Producto";
  const qtyInput = card.querySelector(".qty-input");
  const btnInc = card.querySelector(".inc");
  const btnDec = card.querySelector(".dec");
  const totalSpan = card.querySelector(".total-amount");
  const orderBtn = card.querySelector(".order-btn");

  function recalc() {
    let q = parseInt(qtyInput.value || "1", 10);
    if (isNaN(q) || q < 1) q = 1;
    qtyInput.value = q;
    totalSpan.textContent = (q * price).toFixed(2);
  }

  btnInc.addEventListener("click", () => {
    qtyInput.value = parseInt(qtyInput.value || "1", 10) + 1;
    recalc();
  });
  btnDec.addEventListener("click", () => {
    qtyInput.value = Math.max(1, parseInt(qtyInput.value || "1", 10) - 1);
    recalc();
  });
  qtyInput.addEventListener("input", recalc);

  orderBtn.addEventListener("click", () => {
    const q = parseInt(qtyInput.value || "1", 10);
    const total = (q * price).toFixed(2);
    sendOrder({ item, quantity: q, price: total, notes: "" });
  });

  recalc();
}
document.querySelectorAll(".product-card").forEach(setupProductCard);

async function sendCloseDay() {
  try {
    const body = new URLSearchParams({ action: "cierre" });
    const res = await fetch(API_BASE, { method: "POST", body });
    const data = await res
      .json()
      .catch(() => ({ ok: false, error: "Respuesta inválida" }));
    if (!data.ok)
      throw new Error(data.error || data.message || "Error desconocido");
    showToast("✅ Cierre registrado (Total: " + (data.total || 0) + " Bs.)");
  } catch (err) {
    console.error(err);
    showToast("❌ " + err.message);
  }
}

document.getElementById("btnCierre")?.addEventListener("click", () => {
  if (confirm("¿Seguro que quieres cerrar las ventas del día?")) {
    sendCloseDay();
  }
});
