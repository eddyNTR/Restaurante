// --- CONFIG ---
const GAS_EXEC_URL =
  "https://script.google.com/macros/s/AKfycbwkc8pkgsIwumXLAXsXcr0BZv07VHRagHDhQTWPWzqPUQNgiM_DtKbV1cNR2tFSJ3mZ/exec";
const FLASK_API_BASE = "";
const QR_IMAGE = "/static/qr/images.jpg";

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

// ------------------ CARRITO ------------------
// carrito en memoria
const CART = []; // {id,item,qty,unitPrice,totalPrice}

// helper: encuentra índice por item (nombre exacto)
function findInCart(item) {
  return CART.findIndex((x) => x.item === item);
}

function addToCart(item, qty, unitPrice, sides) {
  qty = parseInt(qty || 1, 10);
  const idx = findInCart(itemAndSidesKey(item, sides));
  if (idx === -1) {
    CART.push({
      id: Math.random().toString(36).slice(2, 9),
      item,
      qty,
      unitPrice: Number(unitPrice) || 0,
      totalPrice: (Number(unitPrice) || 0) * qty,
      sides: Array.isArray(sides) ? sides.slice() : [],
    });
  } else {
    CART[idx].qty += qty;
    CART[idx].totalPrice = CART[idx].qty * (Number(unitPrice) || 0);
  }
  renderCart();
}

// helper para distinguir ítems con distintas guarniciones
function itemAndSidesKey(item, sides) {
  if (!sides || sides.length === 0) return item;
  return item + " | " + sides.join(",");
}

function removeFromCart(itemId) {
  const i = CART.findIndex((x) => x.id === itemId);
  if (i !== -1) {
    CART.splice(i, 1);
    renderCart();
  }
}

function updateQty(itemId, newQty) {
  const i = CART.findIndex((x) => x.id === itemId);
  if (i !== -1) {
    CART[i].qty = Math.max(1, parseInt(newQty || 1, 10));
    CART[i].totalPrice = CART[i].qty * (Number(CART[i].unitPrice) || 0);
    renderCart();
  }
}

function clearCart() {
  CART.length = 0;
  renderCart();
}

function renderCart() {
  const list = document.getElementById("cartList");
  const totalSpan = document.getElementById("cartTotal");
  if (!list) return;
  if (CART.length === 0) {
    list.innerHTML = "No hay artículos en el carrito.";
    totalSpan.textContent = "0.00";
    return;
  }
  let html = '<div style="display:flex;flex-direction:column;gap:8px">';
  let total = 0;
  CART.forEach((it) => {
    total += Number(it.totalPrice || 0);
    const sidesTxt =
      it.sides && it.sides.length
        ? `<div style="font-size:0.9em;color:#bfc7d6;margin-top:4px;">Guarniciones: ${it.sides.join(
            ", "
          )}</div>`
        : "";
    html += `
      <div style="display:flex;gap:8px;align-items:center;justify-content:space-between;">
        <div style="flex:1">
          <strong>${it.item}</strong>
          ${sidesTxt}
          <br/>
          <small class="muted">Bs ${Number(it.unitPrice).toFixed(2)} c/u</small>
        </div>
        <div style="display:flex;gap:6px;align-items:center;">
          <input data-id="${
            it.id
          }" class="cart-qty" type="number" min="1" value="${
      it.qty
    }" style="width:64px;text-align:center;padding:6px;border-radius:6px;background:#0f131b;border:1px solid #2c3447;color:#fff;">
          <div style="width:80px;text-align:right">Bs ${Number(
            it.totalPrice
          ).toFixed(2)}</div>
          <button data-id="${
            it.id
          }" class="cart-remove quick-btn" style="width:42px;padding:6px">×</button>
        </div>
      </div>
    `;
  });
  html += "</div>";
  list.innerHTML = html;
  totalSpan.textContent = total.toFixed(2);

  // attach events
  document.querySelectorAll(".cart-remove").forEach((b) => {
    b.onclick = () => removeFromCart(b.dataset.id);
  });
  document.querySelectorAll(".cart-qty").forEach((i) => {
    i.onchange = (ev) => updateQty(i.dataset.id, ev.target.value);
  });
}

// attachAddToCart: vincula un botón de tarjeta para que agregue al carrito
function attachAddToCart(orderBtn, item, qtyInput, price, cardElem) {
  if (!orderBtn) return;
  orderBtn.addEventListener("click", () => {
    const q = parseInt(qtyInput.value || "1", 10);

    // encontrar checkboxes dentro de la misma tarjeta
    const sides = [];
    if (cardElem) {
      cardElem.querySelectorAll(".side-option:checked").forEach((ch) => {
        sides.push(ch.value || ch.getAttribute("value") || ch.dataset.value);
      });
    }

    addToCart(item, q, price, sides);
    showToast("Artículo agregado al carrito");
  });
}

// --------- Envío del carrito (un solo botón) ---------
async function sendCartAsSummary() {
  if (CART.length === 0) {
    showToast("El carrito está vacío");
    return;
  }
  const total = CART.reduce((s, i) => s + (Number(i.totalPrice) || 0), 0);
  const totalItems = CART.reduce((s, i) => s + Number(i.qty || 0), 0);
  const itemSummary = CART.map((i) => {
    const s = i.sides && i.sides.length ? ` (${i.sides.join(", ")})` : "";
    return `${i.qty}x ${i.item}${s}`;
  }).join(" • ");
  const payload = {
    item: itemSummary,
    quantity: totalItems,
    notes: "",
    price: total.toFixed(2),
  };

  setLoading(true);
  try {
    const gasResp = await sendToGAS(payload);
    sendToFlask(payload).catch(() => {});
    if (!gasResp.ok) {
      showToast(
        "❌ Error al guardar en Sheets: " +
          (gasResp.error || gasResp.message || "")
      );
      return;
    }
    showToast("✅ Pedido enviado: " + itemSummary);
    clearCart();
  } catch (err) {
    console.error(err);
    showToast("❌ " + err.message);
  } finally {
    setLoading(false);
  }
}

// ------------------ LÓGICA DE TARJETAS (INTEGRADA) ------------------
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

  btnInc?.addEventListener("click", () => {
    qtyInput.value = parseInt(qtyInput.value || "1", 10) + 1;
    recalc();
  });
  btnDec?.addEventListener("click", () => {
    qtyInput.value = Math.max(1, parseInt(qtyInput.value || "1", 10) - 1);
    recalc();
  });
  qtyInput?.addEventListener("input", recalc);
  attachAddToCart(orderBtn, item, qtyInput, price, card);

  recalc();
}

// ------------------ INICIALIZACIÓN ------------------
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".product-card").forEach(setupProductCard);

  renderCart();

  document.getElementById("btnClearCart")?.addEventListener("click", () => {
    if (confirm("Vaciar el carrito?")) clearCart();
  });
  document.getElementById("btnSendCart")?.addEventListener("click", () => {
    if (confirm("Enviar pedido al kitchen/meseros?")) sendCartAsSummary();
  });

  document.getElementById("btnCierre")?.addEventListener("click", () => {
    if (confirm("¿Seguro que quieres cerrar las ventas del día?")) {
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

  document.getElementById("btnGoMeseros")?.addEventListener("click", () => {
    window.open("/meseros", "_blank");
  });
});

// ====== Pago: manejadores de Continuar / Cancelar (modal de 2 pasos) ======
(function () {
  const modal = document.getElementById("pay-modal");
  const pmOrderId = document.getElementById("pm-order-id");
  const pmStep1 = document.getElementById("pm-step1");
  const pmResult = document.getElementById("pm-result");

  const withInvoice = document.getElementById("pm-with-invoice");
  const invoiceBox = document.getElementById("pm-invoice-fields");
  const nitInput = document.getElementById("pm-nit");
  const rsInput = document.getElementById("pm-rs");

  const pmConfirm = document.getElementById("pm-confirm");
  const pmCancel = document.getElementById("pm-cancel");

  const pmQRBox = document.getElementById("pm-qr");
  const pmRedirect = document.getElementById("pm-redirect");
  const pmRedLink = document.getElementById("pm-redirect-link");
  const pmVoucher = document.getElementById("pm-voucher");
  const pmVouchCode = document.getElementById("pm-voucher-code");
  const pmVouchExp = document.getElementById("pm-voucher-exp");
  const pmMockPaid = document.getElementById("pm-mock-paid");

  if (!modal) return;

  let currentPaymentId = null;

  // Mostrar/ocultar campos de factura
  withInvoice?.addEventListener("change", () => {
    if (!invoiceBox) return;
    invoiceBox.style.display = withInvoice.checked ? "block" : "none";
  });

  // Botón "Ir al pago" -> abrir modal en Paso 1
  document.getElementById("btnIrPago")?.addEventListener("click", () => {
    if (!Array.isArray(CART) || CART.length === 0) {
      showToast("Primero agrega productos al carrito.");
      return;
    }
    pmOrderId.textContent = "(pendiente)";
    currentPaymentId = null;
    pmStep1.style.display = "block";
    pmResult.style.display = "none";
    if (pmQRBox) pmQRBox.innerHTML = "";
    if (pmRedirect) pmRedirect.style.display = "none";
    if (pmVoucher) pmVoucher.style.display = "none";

    modal.style.display = "block";
  });

  // ✅ Mostrar QR estático desde /static/qr/pago_qr.png (o el que definas)
  function showStaticQR(targetEl) {
    if (!targetEl) return;
    const src = window.QR_STATIC_URL || "/static/qr/images.jpg";
    // <— usa la global o la constante corregida
    console.log("[QR] usando:", src);
    targetEl.innerHTML =
      "<p>Escanea para pagar:</p>" +
      '<img id="pm-qr-img" src="' +
      src +
      '" alt="QR de pago" ' +
      'style="width:220px;height:220px;image-rendering:pixelated;border-radius:8px;border:1px solid #ddd;background:#fff" />';
    const img = document.getElementById("pm-qr-img");
    if (img) {
      img.onload = () => console.log("[QR] cargado OK");
      img.onerror = () => console.error("[QR] 404/err al cargar:", img.src);
    }
  }

  // ✅ Continuar: crea orden, intenta checkout y muestra Paso 2 (con QR estático si method=qr)
  pmConfirm &&
    pmConfirm.addEventListener("click", async function () {
      try {
        // a) Validar carrito y construir resumen
        if (!Array.isArray(CART) || CART.length === 0) {
          showToast("Carrito vacío.");
          return;
        }
        const total = CART.reduce((s, i) => s + (Number(i.totalPrice) || 0), 0);
        const name = CART.map((i) => {
          const sides =
            i.sides && i.sides.length ? ` (${i.sides.join(", ")})` : "";
          return `${i.qty}x ${i.item}${sides}`;
        }).join(" + ");

        // b) Crear orden en backend (envía a meseros)
        const r1 = await fetch("/api/pending", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            item: name,
            quantity: 1,
            notes: "",
            price: Number(total.toFixed(2)),
          }),
        });
        const d1 = await r1.json();
        if (!d1.ok) {
          showToast(d1.error || "No se pudo crear el pedido");
          return;
        }
        const order_id = d1.order.id;
        if (pmOrderId) pmOrderId.textContent = order_id;

        // c) Leer método de pago y datos de factura
        const methodEl = document.querySelector(
          'input[name="pm-method"]:checked'
        );
        const method = methodEl ? methodEl.value : "qr";
        const body = {
          order_id,
          payment_method: method,
          with_invoice: !!(withInvoice && withInvoice.checked),
        };
        if (withInvoice && withInvoice.checked) {
          const nit = (nitInput?.value || "").trim();
          const rs = (rsInput?.value || "").trim();
          if (!nit || !rs) {
            alert("Completa NIT y Razón Social.");
            return;
          }
          body.nit = nit;
          body.razon_social = rs;
        }

        // d) Iniciar checkout (no bloqueamos el QR si method==='qr')
        let d2 = { ok: true };
        try {
          const r2 = await fetch("/api/checkout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          d2 = await r2.json().catch(() => ({ ok: false }));
        } catch (e) {
          console.warn("Checkout request error:", e);
        }

        // e) Mostrar Paso 2 (resultado)
        pmStep1.style.display = "none";
        pmResult.style.display = "block";
        if (pmQRBox) pmQRBox.innerHTML = "";
        if (pmRedirect) pmRedirect.style.display = "none";
        if (pmVoucher) pmVoucher.style.display = "none";

        console.log("[PAY] method:", method);

        // ⬅️ Pintar QR estático si corresponde
        if (method === "qr") {
          showStaticQR(pmQRBox); // usa window.QR_STATIC_URL o /static/qr/images.jpg
        }

        // Tarjeta (si el backend devolvió URL)
        if (method === "card") {
          if (pmCardAmt) pmCardAmt.textContent = Number(total).toFixed(2);
          if (pmCardRef)
            pmCardRef.textContent = (pmOrderId?.textContent || "").trim();
          if (pmCard) pmCard.style.display = "block";
        }

        // Efectivo (si devolvió voucher)
        if (method === "cash" && d2 && d2.voucher && pmVoucher) {
          pmVoucher.style.display = "block";
          if (pmVouchCode) pmVouchCode.textContent = d2.voucher.code || "";
          if (pmVouchExp) pmVouchExp.textContent = d2.voucher.expires_at || "";
        }

        //limpiar carrito
        if (typeof clearCart === "function") clearCart();
      } catch (err) {
        console.error(err);
        showToast("❌ " + (err?.message || err));
      }
    });

  // CANCELAR: si estás en Paso 2 -> vuelve a Paso 1; si ya estás en Paso 1 -> cierra modal
  pmCancel?.addEventListener("click", () => {
    if (pmResult && pmResult.style.display !== "none") {
      pmResult.style.display = "none";
      pmStep1.style.display = "block";
      currentPaymentId = null;
      if (pmQRBox) pmQRBox.innerHTML = "";
      if (pmRedirect) pmRedirect.style.display = "none";
      if (pmVoucher) pmVoucher.style.display = "none";
    } else {
      modal.style.display = "none";
    }
  });

  // (solo dev) marcar pago como PAID desde el modal resultado
  pmMockPaid?.addEventListener("click", async () => {
    if (!currentPaymentId) return;
    const r = await fetch(`/api/payments/${currentPaymentId}/mock-paid`, {
      method: "POST",
    });
    const d = await r.json();
    if (d.ok) {
      alert("Pago marcado como PAID (mock).");
      modal.style.display = "none";
    } else {
      alert(d.error || "No se pudo marcar pagado");
    }
  });
})();
