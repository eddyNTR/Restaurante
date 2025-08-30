# app.py
from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
import threading, uuid, json, os
from datetime import datetime


app = Flask(__name__, static_folder="static", template_folder="templates")
# Si todo lo sirves desde el mismo dominio (Flask), no necesitas CORS.
# CORS(app)

DATA_FILE = "pending.json"   # archivo opcional para persistir la cola
_lock = threading.Lock()
_pending = []

def _load():
    global _pending
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                _pending = json.load(f)
        except Exception as e:
            print("No se pudo cargar pending.json:", e)
            _pending = []
    else:
        _pending = []

def _save():
    try:
        with open(DATA_FILE + ".tmp", "w", encoding="utf-8") as f:
            json.dump(_pending, f, ensure_ascii=False, indent=2, default=str)
        os.replace(DATA_FILE + ".tmp", DATA_FILE)
    except Exception as e:
        print("Error guardando pending.json:", e)

# carga inicial (si quieres sin persistencia, comenta _load())
_load()

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/meseros")
def meseros():
    return render_template("meseros.html")

# Obtener la cola de pedidos (FIFO)
@app.route("/api/pending", methods=["GET"])
def get_pending():
    with _lock:
        return jsonify({"ok": True, "orders": _pending})

# Crear nuevo pedido (desde index)
@app.route("/api/pending", methods=["POST"])
def create_pending():
    data = request.get_json(force=True)
    item = (data.get("item") or "").strip()
    quantity = int(data.get("quantity") or 1)
    notes = (data.get("notes") or "").strip()
    price = data.get("price") or ""
    if not item:
        return jsonify({"ok": False, "error": "Falta item"}), 400
    if quantity <= 0:
        return jsonify({"ok": False, "error": "Cantidad inválida"}), 400

    order = {
        "id": uuid.uuid4().hex[:8],
        "ts": datetime.now().isoformat(sep=" "),
        "item": item,
        "quantity": quantity,
        "notes": notes,
        "price": price
    }
    with _lock:
        _pending.append(order)
        _save()
    return jsonify({"ok": True, "order": order}), 201

# Marcar entregado (elimina de la cola)
@app.route("/api/pending/<order_id>/delivered", methods=["POST"])
def deliver(order_id):
    with _lock:
        idx = next((i for i,o in enumerate(_pending) if o["id"]==order_id), None)
        if idx is None:
            return jsonify({"ok": False, "error": "ID no encontrado"}), 404
        _pending.pop(idx)
        _save()
    return jsonify({"ok": True, "id": order_id})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)

