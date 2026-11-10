// Wires the resources `setup.sh` created (dependsOn, injected URLs, health paths). Edits service.json only.
import fs from "node:fs";

const dir = "services/shop";
const edit = (name, fn) => {
	const f = `${dir}/${name}/service.json`;
	const j = JSON.parse(fs.readFileSync(f, "utf8"));
	fn(j);
	fs.writeFileSync(f, `${JSON.stringify(j, null, 2)}\n`);
	return j;
};
const port = (name) => JSON.parse(fs.readFileSync(`${dir}/${name}/service.json`, "utf8")).port;
const url = (name) => `http://${name}:${port(name)}`;

edit("migrator", (j) => {
	j.dependsOn = ["postgres"];
	delete j.healthCheckPath;
});
edit("catalog", (j) => {
	j.dependsOn = ["migrator"];
});
edit("payments", (j) => {
	j.dependsOn = ["migrator"];
});
edit("orders", (j) => {
	j.dependsOn = ["migrator", "queue", "catalog", "payments"];
	j.env = { CATALOG_URL: url("catalog"), PAYMENTS_URL: url("payments") };
});
edit("notifications", (j) => {
	j.dependsOn = ["migrator", "queue"];
	j.healthCheckPath = "/health";
});
edit("fulfilment", (j) => {
	j.dependsOn = ["queue", "orders"];
	j.env = { ORDERS_URL: url("orders"), SHIP_DELAY_MS: "5000" };
});
edit("storefront", (j) => {
	j.dependsOn = ["catalog", "orders"];
	j.basePath = "/";
});
edit("admin", (j) => {
	j.dependsOn = ["orders", "payments", "notifications"];
	j.basePath = "/admin";
});

// The shop pages keep their markup. The API addresses are injected at build time (%VITE_<SERVICE>_API_URL%, which Flisk
// sets from dependsOn), not hardcoded.
const shop = process.env.BENCH_SHOP;
const api = (s) => `%VITE_${s.toUpperCase()}_API_URL%`;
for (const r of ["storefront", "admin"]) {
	let h = fs.readFileSync(`${shop}/${r}/public/index.html`, "utf8");
	h = h
		.replaceAll("fetch('/api/products", `fetch('${api("catalog")}/api/products`)
		.replaceAll("fetch('/api/orders", `fetch('${api("orders")}/api/orders`)
		.replace(
			"fetch('/api/'+k)",
			`fetch(({orders:'${api("orders")}',payments:'${api("payments")}',notifications:'${api("notifications")}'})[k]+'/api/'+k)`,
		)
		.replaceAll('href="/admin/"', 'href="/admin/"');
	fs.writeFileSync(`${dir}/${r}/index.html`, h);
}
