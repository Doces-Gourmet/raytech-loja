import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, PRODUCT_BUCKET, FALLBACK_WHATSAPP } from "../config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const state = { products: [], cart: loadCart(), query: "", category: "Todos", whatsapp: FALLBACK_WHATSAPP };
const el = (id) => document.getElementById(id);

function loadCart() {
  try { return JSON.parse(localStorage.getItem("raytech-cart") || "[]"); } catch { return []; }
}
function saveCart() { localStorage.setItem("raytech-cart", JSON.stringify(state.cart)); renderCart(); }
function safe(value = "") { return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char])); }
function imageUrl(path) { return path ? supabase.storage.from(PRODUCT_BUCKET).getPublicUrl(path).data.publicUrl : ""; }
function toast(message, error = false) { const node = el("toast"); node.textContent = message; node.classList.toggle("error", error); node.classList.remove("hidden"); clearTimeout(toast.timer); toast.timer = setTimeout(() => node.classList.add("hidden"), 3200); }

async function loadStore() {
  const [settingsResult, productsResult] = await Promise.all([
    supabase.from("store_settings").select("whatsapp,instagram").eq("id", 1).maybeSingle(),
    supabase.from("products").select("id,name,description,category,price,compare_at_price,stock,image_path,featured,created_at").eq("active", true).order("featured", { ascending: false }).order("created_at", { ascending: false })
  ]);
  el("loading-products").classList.add("hidden");
  if (settingsResult.data?.whatsapp) state.whatsapp = settingsResult.data.whatsapp;
  document.querySelectorAll("[data-whatsapp-link]").forEach((link) => link.href = `https://wa.me/${state.whatsapp}`);
  if (productsResult.error) { toast("Não foi possível carregar o catálogo.", true); state.products = []; }
  else state.products = productsResult.data || [];
  state.cart = state.cart.filter((line) => state.products.some((product) => product.id === line.id));
  renderFilters(); renderProducts(); saveCart();
}

function renderFilters() {
  const categories = ["Todos", ...new Set(state.products.map((product) => product.category))];
  el("category-filters").innerHTML = categories.map((category) => `<button class="filter-button ${state.category === category ? "active" : ""}" data-category="${safe(category)}">${safe(category)}</button>`).join("");
}
function renderProducts() {
  const query = state.query.toLocaleLowerCase("pt-BR");
  const products = state.products.filter((product) => (state.category === "Todos" || product.category === state.category) && `${product.name} ${product.description}`.toLocaleLowerCase("pt-BR").includes(query));
  el("empty-products").classList.toggle("hidden", products.length > 0);
  el("product-grid").innerHTML = products.map((product) => {
    const image = imageUrl(product.image_path);
    return `<article class="product-card"><div class="product-image">${image ? `<img src="${safe(image)}" alt="${safe(product.name)}" loading="lazy">` : `<span class="placeholder-phone"><svg><use href="#icon-phone"></use></svg></span>`}${product.featured ? '<span class="badge">DESTAQUE</span>' : ""}</div><div class="product-content"><p class="product-category">${safe(product.category)}</p><h3>${safe(product.name)}</h3><p class="product-description">${safe(product.description)}</p><div class="product-buy"><div>${product.compare_at_price ? `<span class="old-price">${money.format(product.compare_at_price)}</span>` : ""}<strong class="price">${money.format(product.price)}</strong><span class="stock">${product.stock > 0 ? `${product.stock} em estoque` : "Indisponível"}</span></div><button class="add-button" data-add="${product.id}" ${product.stock < 1 ? "disabled" : ""} aria-label="Adicionar ${safe(product.name)}">＋</button></div></div></article>`;
  }).join("");
}

function addToCart(id) {
  const product = state.products.find((item) => item.id === id);
  if (!product || product.stock < 1) return;
  const line = state.cart.find((item) => item.id === id);
  if (line) line.quantity = Math.min(line.quantity + 1, product.stock); else state.cart.push({ id, quantity: 1 });
  saveCart(); toast(`${product.name} foi adicionado ao carrinho.`);
}
function setQuantity(id, quantity) {
  const product = state.products.find((item) => item.id === id);
  if (!product) return;
  if (quantity <= 0) state.cart = state.cart.filter((item) => item.id !== id); else state.cart.find((item) => item.id === id).quantity = Math.min(quantity, product.stock);
  saveCart();
}
function cartDetails() { return state.cart.map((line) => ({ ...line, product: state.products.find((product) => product.id === line.id) })).filter((line) => line.product); }
function cartTotal() { return cartDetails().reduce((sum, line) => sum + Number(line.product.price) * line.quantity, 0); }
function renderCart() {
  const lines = cartDetails();
  const units = lines.reduce((sum, line) => sum + line.quantity, 0);
  el("cart-count").textContent = units;
  el("cart-count").classList.toggle("hidden", units === 0);
  el("checkout-button").disabled = units === 0;
  el("cart-total").textContent = money.format(cartTotal());
  el("checkout-total").textContent = money.format(cartTotal());
  el("cart-items").innerHTML = lines.length ? lines.map(({ product, quantity }) => { const image = imageUrl(product.image_path); return `<article class="cart-line">${image ? `<img src="${safe(image)}" alt="">` : `<span class="cart-line-placeholder"><svg><use href="#icon-phone"></use></svg></span>`}<div><h3>${safe(product.name)}</h3><p>${money.format(product.price)}</p><div class="quantity"><button data-qty="${product.id}" data-value="${quantity - 1}" aria-label="Diminuir">−</button><span>${quantity}</span><button data-qty="${product.id}" data-value="${quantity + 1}" aria-label="Aumentar">＋</button></div></div><button class="remove-line" data-remove="${product.id}" aria-label="Remover">×</button></article>`; }).join("") : '<div class="cart-empty"><div><svg width="36" height="36"><use href="#icon-cart"></use></svg><p>Seu carrinho está vazio.</p></div></div>';
}
function toggleCart(open) { el("cart-drawer").classList.toggle("open", open); el("drawer-backdrop").classList.toggle("hidden", !open); el("cart-drawer").setAttribute("aria-hidden", String(!open)); document.body.style.overflow = open ? "hidden" : ""; }

async function submitOrder(event) {
  event.preventDefault();
  const button = el("submit-order"); button.disabled = true; button.textContent = "Registrando...";
  const form = new FormData(event.currentTarget);
  const { data, error } = await supabase.rpc("place_order", { p_customer_name: form.get("name"), p_customer_phone: form.get("phone"), p_notes: form.get("notes"), p_items: state.cart.map((line) => ({ productId: line.id, quantity: line.quantity })) });
  button.disabled = false; button.textContent = "Enviar pedido pelo WhatsApp";
  if (error) { toast(error.message || "Não foi possível registrar o pedido.", true); return; }
  const lines = data.items.map((item) => `• ${item.quantity}x ${item.name} — ${money.format(item.lineTotal)}`);
  const message = [`Olá, RayTech! Quero finalizar o pedido *${data.code}*.`, "", ...lines, "", `*Total: ${money.format(data.total)}*`, `Cliente: ${form.get("name")}`, `Contato: ${form.get("phone")}`, form.get("notes") ? `Observação: ${form.get("notes")}` : ""].filter(Boolean).join("\n");
  state.cart = []; saveCart(); event.currentTarget.reset(); el("checkout-dialog").close(); toggleCart(false);
  window.location.href = `https://wa.me/${state.whatsapp}?text=${encodeURIComponent(message)}`;
}

document.addEventListener("click", (event) => {
  const add = event.target.closest("[data-add]"); if (add) addToCart(add.dataset.add);
  const category = event.target.closest("[data-category]"); if (category) { state.category = category.dataset.category; renderFilters(); renderProducts(); }
  const qty = event.target.closest("[data-qty]"); if (qty) setQuantity(qty.dataset.qty, Number(qty.dataset.value));
  const remove = event.target.closest("[data-remove]"); if (remove) setQuantity(remove.dataset.remove, 0);
});
for (const id of ["desktop-search", "mobile-search"]) el(id).addEventListener("input", (event) => { state.query = event.target.value; document.querySelectorAll("#desktop-search,#mobile-search").forEach((input) => { if (input !== event.target) input.value = state.query; }); renderProducts(); });
el("cart-button").addEventListener("click", () => toggleCart(true));
el("close-cart").addEventListener("click", () => toggleCart(false));
el("drawer-backdrop").addEventListener("click", () => toggleCart(false));
el("checkout-button").addEventListener("click", () => el("checkout-dialog").showModal());
el("close-checkout").addEventListener("click", () => el("checkout-dialog").close());
el("checkout-form").addEventListener("submit", submitOrder);
renderCart(); loadStore();
