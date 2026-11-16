import assert from "node:assert/strict";
import fs from "node:fs";
export async function verifyAnalyticsHistory(client, { rid, other }) {
  await client.query("RESET ROLE");
  const cat = (
    await client.query(
      "INSERT INTO categories(restaurant_id,name,kind) VALUES($1,'Categoria original','food') RETURNING id",
      [rid],
    )
  ).rows[0].id;
  const next = (
    await client.query(
      "INSERT INTO categories(restaurant_id,name,kind) VALUES($1,'Novo bar','drink') RETURNING id",
      [rid],
    )
  ).rows[0].id;
  const product = (
    await client.query(
      "INSERT INTO menu_items(restaurant_id,category_id,name,price) VALUES($1,$2,'Prato histórico',20) RETURNING id",
      [rid, cat],
    )
  ).rows[0].id;
  const order = (
    await client.query(
      "INSERT INTO orders(restaurant_id,status,subtotal) VALUES($1,'served',20) RETURNING id",
      [rid],
    )
  ).rows[0].id;
  const item = (
    await client.query(
      "INSERT INTO order_items(order_id,menu_item_id,name_snapshot,price_snapshot,quantity,category_id_snapshot,department_snapshot) VALUES($1,$2,'Prato histórico',20,1,$3,'drink') RETURNING *",
      [order, product, next],
    )
  ).rows[0];
  assert.equal(item.product_id_snapshot, product);
  assert.equal(item.category_id_snapshot, cat);
  assert.equal(item.category_name_snapshot, "Categoria original");
  assert.equal(item.department_snapshot, "food");
  await client.query("UPDATE menu_items SET category_id=$2 WHERE id=$1", [product, next]);
  await client.query("UPDATE categories SET name='Categoria renomeada' WHERE id=$1", [cat]);
  await client.query(
    "SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false)",
  );
  await client.query("SET ROLE authenticated");
  await client.query(
    "UPDATE order_items SET category_id_snapshot=$2,department_snapshot='drink',product_id_snapshot=NULL WHERE id=$1",
    [item.id, next],
  );
  const saved = (await client.query("SELECT * FROM order_items WHERE id=$1", [item.id])).rows[0];
  assert.equal(saved.product_id_snapshot, product);
  assert.equal(saved.category_id_snapshot, cat);
  assert.equal(saved.category_name_snapshot, "Categoria original");
  assert.equal(saved.department_snapshot, "food");
  await client.query("RESET ROLE");
  await client.query("DELETE FROM menu_items WHERE id=$1", [product]);
  const deleted = (await client.query("SELECT * FROM order_items WHERE id=$1", [item.id])).rows[0];
  assert.equal(deleted.menu_item_id, null);
  assert.equal(deleted.product_id_snapshot, product);
  assert.equal(deleted.department_snapshot, "food");
  const otherCat = (
    await client.query(
      "INSERT INTO categories(restaurant_id,name) VALUES($1,'Outra casa') RETURNING id",
      [other],
    )
  ).rows[0].id;
  const otherItem = (
    await client.query(
      "INSERT INTO menu_items(restaurant_id,category_id,name,price) VALUES($1,$2,'Outro produto',12) RETURNING id",
      [other, otherCat],
    )
  ).rows[0].id;
  await assert.rejects(
    client.query(
      "INSERT INTO order_items(order_id,menu_item_id,name_snapshot,price_snapshot) VALUES($1,$2,'Inválido',12)",
      [order, otherItem],
    ),
  );
  await client.query("SET ROLE anon");
  await assert.rejects(client.query("SELECT * FROM order_items"));
  await assert.rejects(client.query("SELECT capture_order_item_classification()"));
  await client.query("RESET ROLE");
  await client.query(
    fs.readFileSync(
      new URL("../supabase/migrations/20261116000700_analytics_item_history.sql", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(
    (await client.query("SELECT department_snapshot FROM order_items WHERE id=$1", [item.id]))
      .rows[0].department_snapshot,
    "food",
  );
  console.log(
    "PASS: immutable historical product/category/department snapshots, catalogue moves/renames/deletion, forged classification rejection, tenant isolation and migration reapplication",
  );
}
