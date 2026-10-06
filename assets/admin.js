import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, PRODUCT_BUCKET } from "../config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const el = (id) => document.getElementById(id);
let products = [];
let orders = [];
let currentUser = null;

function safe(value = "") { return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char])); }
function imageUrl(path) { return path ? supabase.storage.from(PRODUCT_BUCKET).getPublicUrl(path).data.publicUrl : ""; }
function toast(message, error = false) { const node = el("toast"); node.textContent = message; node.classList.toggle("error", error); node.classList.remove("hidden"); clearTimeout(toast.timer); toast.timer = setTimeout(() => node.classList.add("hidden"), 3600); }
function showOnly(id) { ["login-view", "signup-view", "admin-view"].forEach((view) => el(view).classList.toggle("hidden", view !== id)); }
function parseMoney(value) { const normalized = String(value || "").trim().replace(/\s/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", "."); const parsed = Number(normalized); return Number.isFinite(parsed) ? parsed : 0; }

async function boot() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) { showOnly("login-view"); return; }
  await enterAdmin(data.session.user);
}
async function enterAdmin(user) {
  const { data, error } = await supabase.rpc("is_raytech_admin");
  if (error || !data) { await supabase.auth.signOut(); showOnly("login-view"); toast("Este e-mail não possui acesso administrativo.", true); return; }
  currentUser = user; el("admin-email").textContent = user.email || ""; showOnly("admin-view"); await Promise.all([loadProducts(), loadOrders()]);
}

el("login-form").addEventListener("submit", async (event) => {
  event.preventDefault(); const button = event.currentTarget.querySelector("button"); button.disabled = true; button.textContent = "Entrando...";
  const form = new FormData(event.currentTarget); const { data, error } = await supabase.auth.signInWithPassword({ email: form.get("email"), password: form.get("password") });
  button.disabled = false; button.textContent = "Entrar";
  if (error) { toast("E-mail ou senha inválidos.", true); return; }
  await enterAdmin(data.user);
});
el("signup-form").addEventListener("submit", async (event) => {
  event.preventDefault(); const form = new FormData(event.currentTarget); if (form.get("password") !== form.get("confirmation")) { toast("As senhas não são iguais.", true); return; }
  const button = event.currentTarget.querySelector("button"); button.disabled = true; button.textContent = "Criando...";
  const { data, error } = await supabase.auth.signUp({ email: form.get("email"), password: form.get("password") });
  button.disabled = false; button.textContent = "Criar conta";
  if (error) { toast(error.message, true); return; }
  if (data.session) await enterAdmin(data.user); else { showOnly("login-view"); toast("Conta criada. Confirme o e-mail e depois faça login."); }
});
el("show-signup").addEventListener("click", () => showOnly("signup-view"));
el("show-login").addEventListener("click", () => showOnly("login-view"));
el("logout-button").addEventListener("click", async () => { await supabase.auth.signOut(); location.reload(); });

async function loadProducts() {
  el("products-table").innerHTML = '<tr><td class="admin-loading" colspan="5">Carregando produtos...</td></tr>';
  const { data, error } = await supabase.from("products").select("*").order("created_at", { ascending: false });
  if (error) { toast("Não foi possível carregar os produtos.", true); return; }
  products = data || []; renderProducts();
}
function renderProducts() {
  el("stat-products").textContent = products.length; el("stat-stock").textContent = products.reduce((sum, item) => sum + item.stock, 0);
  el("empty-admin-products").classList.toggle("hidden", products.length > 0);
  el("products-table").innerHTML = products.map((product) => { const image = imageUrl(product.image_path); return `<tr><td><div class="product-cell">${image ? `<img src="${safe(image)}" alt="">` : '<span class="product-thumb">▣</span>'}<div><strong>${safe(product.name)}</strong><small>${safe(product.category)}</small></div></div></td><td>${money.format(product.price)}</td><td>${product.stock}</td><td><button class="status-pill ${product.active ? "active" : ""}" data-toggle="${product.id}">${product.active ? "Disponível" : "Oculto"}</button></td><td><div class="table-actions"><button class="table-action" data-edit="${product.id}">Editar</button><button class="table-action danger" data-delete="${product.id}">Excluir</button></div></td></tr>`; }).join("");
}

async function loadOrders() {
  el("orders-table").innerHTML = '<tr><td class="admin-loading" colspan="4">Carregando pedidos...</td></tr>';
  const { data, error } = await supabase.from("orders").select("id,code,customer_name,customer_phone,total,status,created_at").order("created_at", { ascending: false }).limit(100);
  if (error) { toast("Não foi possível carregar os pedidos.", true); return; }
  orders = data || []; el("stat-orders").textContent = orders.length; el("empty-orders").classList.toggle("hidden", orders.length > 0);
  el("orders-table").innerHTML = orders.map((order) => `<tr><td><strong>${safe(order.code)}</strong><small>${new Date(order.created_at).toLocaleString("pt-BR")}</small></td><td>${safe(order.customer_name)}<small>${safe(order.customer_phone)}</small></td><td>${money.format(order.total)}</td><td><select class="order-status" data-order-status="${order.id}"><option value="novo" ${order.status === "novo" ? "selected" : ""}>Novo</option><option value="confirmado" ${order.status === "confirmado" ? "selected" : ""}>Confirmado</option><option value="concluido" ${order.status === "concluido" ? "selected" : ""}>Concluído</option><option value="cancelado" ${order.status === "cancelado" ? "selected" : ""}>Cancelado</option></select></td></tr>`).join("");
}

async function uploadImage(file) {
  if (!file?.size) return null;
  if (file.size > 8 * 1024 * 1024) throw new Error("A imagem deve ter no máximo 8 MB.");
  const extension = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${currentUser.id}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(PRODUCT_BUCKET).upload(path, file, { cacheControl: "3600", upsert: false });
  if (error) throw error; return path;
}

el("product-form").addEventListener("submit", async (event) => {
  event.preventDefault(); const form = new FormData(event.currentTarget); const id = form.get("id"); const oldPath = form.get("currentImagePath") || null; const button = el("save-product"); button.disabled = true; button.textContent = "Salvando..."; let uploadedPath = null;
  try {
    uploadedPath = await uploadImage(form.get("image"));
    const payload = { name: String(form.get("name")).trim(), category: form.get("category"), price: parseMoney(form.get("price")), compare_at_price: parseMoney(form.get("compareAtPrice")) || null, stock: Math.max(0, Number(form.get("stock")) || 0), description: String(form.get("description") || "").trim(), image_path: uploadedPath || oldPath, active: form.get("active") === "on", featured: form.get("featured") === "on", updated_at: new Date().toISOString() };
    if (!payload.name || payload.price <= 0) throw new Error("Informe nome e preço válidos.");
    const result = id ? await supabase.from("products").update(payload).eq("id", id) : await supabase.from("products").insert(payload);
    if (result.error) throw result.error;
    if (uploadedPath && oldPath) await supabase.storage.from(PRODUCT_BUCKET).remove([oldPath]);
    resetProductForm(); await loadProducts(); toast(id ? "Produto atualizado." : "Produto cadastrado.");
  } catch (error) { if (uploadedPath) await supabase.storage.from(PRODUCT_BUCKET).remove([uploadedPath]); toast(error.message || "Não foi possível salvar o produto.", true); }
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
  const toggle = event.target.closest("[data-toggle]"); if (toggle) { const product = products.find((item) => item.id === toggle.dataset.toggle); if (!product) return; toggle.disabled = true; const { error } = await supabase.from("products").update({ active: !product.active, updated_at: new Date().toISOString() }).eq("id", product.id); if (error) toast(error.message, true); else await loadProducts(); }
  const remove = event.target.closest("[data-delete]"); if (remove) { const product = products.find((item) => item.id === remove.dataset.delete); if (!product || !confirm(`Excluir o produto "${product.name}"?`)) return; remove.disabled = true; const { error } = await supabase.from("products").delete().eq("id", product.id); if (error) toast(error.message, true); else { if (product.image_path) await supabase.storage.from(PRODUCT_BUCKET).remove([product.image_path]); await loadProducts(); toast("Produto excluído."); } }
});
document.addEventListener("change", async (event) => { const select = event.target.closest("[data-order-status]"); if (!select) return; select.disabled = true; const { error } = await supabase.from("orders").update({ status: select.value, updated_at: new Date().toISOString() }).eq("id", select.dataset.orderStatus); select.disabled = false; if (error) toast(error.message, true); else toast("Status do pedido atualizado."); });
el("refresh-products").addEventListener("click", loadProducts); el("refresh-orders").addEventListener("click", loadOrders);
boot();
