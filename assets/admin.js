import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, PRODUCT_BUCKET } from "../config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const ADMIN_ENDPOINT = `${SUPABASE_URL}/functions/v1/raytech-admin`;
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const el = (id) => document.getElementById(id);
let products = [];
let orders = [];
let adminPin = sessionStorage.getItem("raytech_admin_pin") || "";

function safe(value = "") { return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char])); }
function imageUrl(path) { return path ? supabase.storage.from(PRODUCT_BUCKET).getPublicUrl(path).data.publicUrl : ""; }
function toast(message, error = false) { const node = el("toast"); node.textContent = message; node.classList.toggle("error", error); node.classList.remove("hidden"); clearTimeout(toast.timer); toast.timer = setTimeout(() => node.classList.add("hidden"), 3600); }
function showAdmin(show) { el("login-view").classList.toggle("hidden", show); el("admin-view").classList.toggle("hidden", !show); }
function parseMoney(value) { const normalized = String(value || "").trim().replace(/\s/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", "."); const parsed = Number(normalized); return Number.isFinite(parsed) ? parsed : 0; }

async function adminRequest(action, payload = {}) {
  const response = await fetch(ADMIN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_PUBLISHABLE_KEY },
    body: JSON.stringify({ action, pin: adminPin, ...payload }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 || response.status === 429) { sessionStorage.removeItem("raytech_admin_pin"); adminPin = ""; showAdmin(false); }
    throw new Error(result.error || "Não foi possível concluir a operação.");
  }
  return result;
}

async function boot() {
  if (!/^\d{4}$/.test(adminPin)) { showAdmin(false); return; }
  try { await adminRequest("login"); await enterAdmin(); } catch { showAdmin(false); }
}
async function enterAdmin() { sessionStorage.setItem("raytech_admin_pin", adminPin); showAdmin(true); await Promise.all([loadProducts(), loadOrders()]); }

el("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button");
  const form = new FormData(event.currentTarget);
  const pin = String(form.get("pin") || "").trim();
  if (!/^\d{4}$/.test(pin)) { toast("Informe o PIN de 4 dígitos.", true); return; }
  button.disabled = true; button.textContent = "Entrando..."; adminPin = pin;
  try { await adminRequest("login"); await enterAdmin(); }
  catch (error) { adminPin = ""; toast(error.message || "PIN inválido.", true); }
  finally { button.disabled = false; button.textContent = "Entrar"; }
});
el("logout-button").addEventListener("click", () => { sessionStorage.removeItem("raytech_admin_pin"); adminPin = ""; location.reload(); });

async function loadProducts() {
  el("products-table").innerHTML = '<tr><td class="admin-loading" colspan="5">Carregando produtos...</td></tr>';
  try { const result = await adminRequest("list-products"); products = result.products || []; renderProducts(); }
  catch (error) { toast(error.message || "Não foi possível carregar os produtos.", true); }
}
function renderProducts() {
  el("stat-products").textContent = products.length; el("stat-stock").textContent = products.reduce((sum, item) => sum + item.stock, 0);
  el("empty-admin-products").classList.toggle("hidden", products.length > 0);
  el("products-table").innerHTML = products.map((product) => { const image = imageUrl(product.image_path); return `<tr><td><div class="product-cell">${image ? `<img src="${safe(image)}" alt="">` : '<span class="product-thumb">▣</span>'}<div><strong>${safe(product.name)}</strong><small>${safe(product.category)}</small></div></div></td><td>${money.format(product.price)}</td><td>${product.stock}</td><td><button class="status-pill ${product.active ? "active" : ""}" data-toggle="${product.id}">${product.active ? "Disponível" : "Oculto"}</button></td><td><div class="table-actions"><button class="table-action" data-edit="${product.id}">Editar</button><button class="table-action danger" data-delete="${product.id}">Excluir</button></div></td></tr>`; }).join("");
}

async function loadOrders() {
  el("orders-table").innerHTML = '<tr><td class="admin-loading" colspan="4">Carregando pedidos...</td></tr>';
  try {
    const result = await adminRequest("list-orders"); orders = result.orders || []; el("stat-orders").textContent = orders.length; el("empty-orders").classList.toggle("hidden", orders.length > 0);
    el("orders-table").innerHTML = orders.map((order) => `<tr><td><strong>${safe(order.code)}</strong><small>${new Date(order.created_at).toLocaleString("pt-BR")}</small></td><td>${safe(order.customer_name)}<small>${safe(order.customer_phone)}</small></td><td>${money.format(order.total)}</td><td><select class="order-status" data-order-status="${order.id}"><option value="novo" ${order.status === "novo" ? "selected" : ""}>Novo</option><option value="confirmado" ${order.status === "confirmado" ? "selected" : ""}>Confirmado</option><option value="concluido" ${order.status === "concluido" ? "selected" : ""}>Concluído</option><option value="cancelado" ${order.status === "cancelado" ? "selected" : ""}>Cancelado</option></select></td></tr>`).join("");
  } catch (error) { toast(error.message || "Não foi possível carregar os pedidos.", true); }
}

async function uploadImage(file) {
  if (!file?.size) return null;
  if (file.size > 8 * 1024 * 1024) throw new Error("A imagem deve ter no máximo 8 MB.");
  const body = new FormData(); body.append("action", "upload-image"); body.append("pin", adminPin); body.append("file", file);
  const response = await fetch(ADMIN_ENDPOINT, { method: "POST", headers: { apikey: SUPABASE_PUBLISHABLE_KEY }, body });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Não foi possível enviar a imagem.");
  return result.path;
}

el("product-form").addEventListener("submit", async (event) => {
  event.preventDefault(); const form = new FormData(event.currentTarget); const id = form.get("id"); const oldPath = form.get("currentImagePath") || null; const button = el("save-product"); button.disabled = true; button.textContent = "Salvando..."; let uploadedPath = null;
  try {
    uploadedPath = await uploadImage(form.get("image"));
    const product = { name: String(form.get("name")).trim(), category: form.get("category"), price: parseMoney(form.get("price")), compare_at_price: parseMoney(form.get("compareAtPrice")) || null, stock: Math.max(0, Number(form.get("stock")) || 0), description: String(form.get("description") || "").trim(), image_path: uploadedPath || oldPath, active: form.get("active") === "on", featured: form.get("featured") === "on" };
    if (!product.name || product.price <= 0) throw new Error("Informe nome e preço válidos.");
    await adminRequest("save-product", { id: id || null, product, old_image_path: uploadedPath ? oldPath : null });
    resetProductForm(); await loadProducts(); toast(id ? "Produto atualizado." : "Produto cadastrado.");
  } catch (error) { if (uploadedPath) await adminRequest("delete-image", { path: uploadedPath }).catch(() => {}); toast(error.message || "Não foi possível salvar o produto.", true); }
  finally { button.disabled = false; button.textContent = "Salvar produto"; }
});

function editProduct(id) {
  const product = products.find((item) => item.id === id); if (!product) return;
  const form = el("product-form"); const field = (name) => form.elements.namedItem(name); field("id").value = product.id; field("currentImagePath").value = product.image_path || ""; field("name").value = product.name; field("category").value = product.category; field("price").value = Number(product.price).toFixed(2).replace(".", ","); field("compareAtPrice").value = product.compare_at_price ? Number(product.compare_at_price).toFixed(2).replace(".", ",") : ""; field("stock").value = product.stock; field("description").value = product.description; field("active").checked = product.active; field("featured").checked = product.featured;
  el("product-form-title").textContent = "Editar produto"; el("cancel-edit").classList.remove("hidden"); window.scrollTo({ top: 0, behavior: "smooth" });
}
function resetProductForm() { const form = el("product-form"); const field = (name) => form.elements.namedItem(name); form.reset(); field("id").value = ""; field("currentImagePath").value = ""; field("stock").value = 1; field("active").checked = true; el("product-form-title").textContent = "Cadastrar produto"; el("cancel-edit").classList.add("hidden"); }
el("cancel-edit").addEventListener("click", resetProductForm);

document.addEventListener("click", async (event) => {
  const edit = event.target.closest("[data-edit]"); if (edit) editProduct(edit.dataset.edit);
  const toggle = event.target.closest("[data-toggle]"); if (toggle) { const product = products.find((item) => item.id === toggle.dataset.toggle); if (!product) return; toggle.disabled = true; try { await adminRequest("toggle-product", { id: product.id, active: !product.active }); await loadProducts(); } catch (error) { toast(error.message, true); } }
  const remove = event.target.closest("[data-delete]"); if (remove) { const product = products.find((item) => item.id === remove.dataset.delete); if (!product || !confirm(`Excluir o produto "${product.name}"?`)) return; remove.disabled = true; try { await adminRequest("delete-product", { id: product.id }); await loadProducts(); toast("Produto excluído."); } catch (error) { toast(error.message, true); } }
});
document.addEventListener("change", async (event) => { const select = event.target.closest("[data-order-status]"); if (!select) return; select.disabled = true; try { await adminRequest("update-order-status", { id: select.dataset.orderStatus, status: select.value }); toast("Status do pedido atualizado."); } catch (error) { toast(error.message, true); } finally { select.disabled = false; } });
el("refresh-products").addEventListener("click", loadProducts); el("refresh-orders").addEventListener("click", loadOrders);
boot();
