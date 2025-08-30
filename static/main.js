// static/main.js (reemplaza el anterior)

// --- CONFIG ---
const GAS_EXEC_URL =
  "https://script.google.com/macros/s/AKfycbwkc8pkgsIwumXLAXsXcr0BZv07VHRagHDhQTWPWzqPUQNgiM_DtKbV1cNR2tFSJ3mZ/exec";
// Si tu Flask corre en el mismo origen que la página (recomendado) deja FLASK_API_BASE = ""
// Si corres Flask en http://127.0.0.1:5000 pero abres index con Live Server en otro puerto, pon:
// const FLASK_API_BASE = "http://127.0.0.1:5000";
const FLASK_API_BASE = "";

// --- UI helpers ---
function showToast(msg) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.style.display = "block";
  setTimeout(() => {
    t.style.display = "none";
  }, 2600);
}
function setLoading(on) {
  const l = document.getElementById("loader");
  if (l) l.style.display = on ? "block" : "none";
  const submitButtons = document.querySelectorAll(
    ".order-btn, #sendOrder, .submit"
  );
  submitButtons.forEach((b) => (b.disabled = on));
}

// --- Enviar a Google Apps Script (form-urlencoded) ---
async function sendToGAS(payload) {
  try {
    const body = new URLSearchParams({
      item: String(payload.item || ""),
      quantity: String(payload.quantity || 1),
      notes: String(payload.notes || ""),
      price: String(payload.price || ""),
    });
    const res = await fetch(GAS_EXEC_URL, { method: "POST", body });
    const data = await res
      .json()
      .catch(() => ({ ok: false, error: "Respuesta inválida de GAS" }));
    return data;
  } catch (err) {
    console.error("Error en GAS:", err);
    return { ok: false, error: String(err) };
  }
}

// --- Enviar al Flask (JSON) ---
async function sendToFlask(payload) {
  try {
    const url = (FLASK_API_BASE || "") + "/api/pending";
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res
      .json()
      .catch(() => ({ ok: false, error: "Respuesta inválida de Flask" }));
    return data;
  } catch (err) {
    console.error("Error en Flask:", err);
    return { ok: false, error: String(err) };
  }
}

// --- sendOrder principal: guarda en GAS y NOTIFICA al tablero (Flask) ---
async function sendOrder(payload) {
  try {
    if (!payload.item || String(payload.item).trim() === "") {
      showToast("❌ Falta el item.");
      return;
    }
    if (!payload.quantity || Number(payload.quantity) <= 0) {
      showToast("❌ Cantidad inválida.");
      return;
    }

    setLoading(true);
    showToast("Enviando pedido...");

    // 1) Enviar a Google Sheets (GAS) y esperar resultado para feedback
    const gasResp = await sendToGAS(payload);

    // 2) NOTIFICAR al tablero (Flask) en paralelo (no bloqueante)
    //    intentamos siempre, aunque GAS haya fallado (para que meseros vean la comanda)
    sendToFlask(payload)
      .then((fResp) => {
        if (!fResp.ok)
          console.warn("No se notificó al tablero:", fResp.error || fResp);
      })
      .catch((err) => console.warn("Error notificando al tablero:", err));

    if (!gasResp.ok) {
      showToast(
        "❌ Error al guardar en Sheets: " +
          (gasResp.error || gasResp.message || "error")
      );
      return;
    }

    showToast("✅ Pedido registrado y enviado al tablero");
  } catch (err) {
    console.error(err);
    showToast("❌ " + err.message);
  } finally {
    setLoading(false);
  }
}

// --- Lógica de tarjetas (mantiene tu comportamiento actual) ---
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

    // payload que se enviará tanto a GAS como a Flask (meseros)
    const payload = { item, quantity: q, notes: "", price: total };

    // Llamada principal (GAS + notificación a Flask)
    sendOrder(payload);
  });

  recalc();
}

// --- Inicialización segura ---
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".product-card").forEach(setupProductCard);

  // opcional: si tienes botones globales (ej. cierre de día)
  document.getElementById("btnCierre")?.addEventListener("click", () => {
    if (confirm("¿Seguro que quieres cerrar las ventas del día?")) {
      // el cierre se hace SOLO en GAS (mantener historial en Sheets)
      (async () => {
        try {
          setLoading(true);
          const body = new URLSearchParams({ action: "cierre" });
          const res = await fetch(GAS_EXEC_URL, { method: "POST", body });
          const data = await res
            .json()
            .catch(() => ({ ok: false, error: "Respuesta inválida" }));
          if (!data.ok)
            throw new Error(data.error || data.message || "Error desconocido");
          showToast(
            "✅ Cierre registrado (Total: " + (data.total || 0) + " Bs.)"
          );
        } catch (err) {
          console.error(err);
          showToast("❌ " + err.message);
        } finally {
          setLoading(false);
        }
      })();
    }
  });
});

// Abrir tablero de meseros (misma pestaña)
document.getElementById("btnGoMeseros")?.addEventListener("click", (e) => {
  // si tu ruta es /meseros en Flask (recomendado):
  window.location.href = "/meseros";
  // si quieres abrir una URL completa en otro servidor, usa:
  // window.location.href = "http://127.0.0.1:5000/meseros";
});
