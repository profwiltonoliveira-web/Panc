import { test } from "node:test";
import assert from "node:assert/strict";
import { destinoPosLogin } from "./auth-redirect.ts";

test("administrador sem next vai direto para /admin", () => {
  assert.equal(destinoPosLogin("administrador", null), "/admin");
  assert.equal(destinoPosLogin("administrador", undefined), "/admin");
});

test("pesquisador sem next vai para /pesquisador", () => {
  assert.equal(destinoPosLogin("pesquisador", null), "/pesquisador");
});

test("papel desconhecido/ausente (ex.: falha ao ler o perfil) cai no destino seguro /pesquisador, nunca em /admin", () => {
  assert.equal(destinoPosLogin(null, null), "/pesquisador");
  assert.equal(destinoPosLogin(undefined, null), "/pesquisador");
  assert.equal(destinoPosLogin("visitante", null), "/pesquisador");
});

test("administrador com next compatível é respeitado", () => {
  assert.equal(destinoPosLogin("administrador", "/admin/revisao"), "/admin/revisao");
  assert.equal(destinoPosLogin("administrador", "/pesquisador/verbetes"), "/pesquisador/verbetes");
});

test("pesquisador com next para a própria área é respeitado", () => {
  assert.equal(destinoPosLogin("pesquisador", "/pesquisador/verbetes/novo"), "/pesquisador/verbetes/novo");
});

test("pesquisador NUNCA é direcionado para uma rota administrativa, mesmo pedindo via next", () => {
  assert.equal(destinoPosLogin("pesquisador", "/admin"), "/pesquisador");
  assert.equal(destinoPosLogin("pesquisador", "/admin/revisao"), "/pesquisador");
  assert.equal(destinoPosLogin("pesquisador", "/admin/pesquisadores"), "/pesquisador");
});

test("next que não é um caminho local seguro é ignorado (evita redirecionamento aberto)", () => {
  assert.equal(destinoPosLogin("administrador", "//evil.com"), "/admin");
  assert.equal(destinoPosLogin("administrador", "https://evil.com"), "/admin");
  assert.equal(destinoPosLogin("pesquisador", "//evil.com/admin"), "/pesquisador");
  assert.equal(destinoPosLogin("pesquisador", "sem-barra-inicial"), "/pesquisador");
});

test("next vazio é tratado como ausente", () => {
  assert.equal(destinoPosLogin("administrador", ""), "/admin");
});
