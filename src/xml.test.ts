import assert from "node:assert/strict";
import { test } from "node:test";

import { attribute, directText, elementChildren, parseXml, XmlError } from "./xml.js";

test("parseXml reads elements, text, attributes, and entities", () => {
  const root = parseXml(`<?xml version="1.0" encoding="UTF-8"?>
<model id="m">
  <name>Shipper &amp; Co &#38; &#x26;</name>
  <empty/>
  <quoted attr='say "hi"'/>
</model>`);
  assert.equal(root.local, "model");
  assert.equal(attribute(root, "id"), "m");
  const name = elementChildren(root, "name")[0];
  assert.ok(name);
  assert.equal(directText(name), "Shipper & Co & &");
  assert.equal(elementChildren(root, "empty").length, 1);
  const quoted = elementChildren(root, "quoted")[0];
  assert.ok(quoted);
  assert.equal(attribute(quoted, "attr"), 'say "hi"');
});

test("parseXml keeps CDATA and skips comments", () => {
  const root = parseXml(`<model><!-- hidden --><note><![CDATA[a < b & c]]></note></model>`);
  const note = elementChildren(root, "note")[0];
  assert.ok(note);
  assert.equal(directText(note), "a < b & c");
  assert.equal(root.children.some((child) => child.type === "text" && child.text.includes("hidden")), false);
});

test("parseXml resolves a default namespace and a prefixed xsi attribute", () => {
  const root = parseXml(`<model xmlns="http://www.opengroup.org/xsd/archimate/3.0/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <element xsi:type="BusinessActor" xml:lang="en"/>
</model>`);
  assert.equal(root.ns, "http://www.opengroup.org/xsd/archimate/3.0/");
  const element = elementChildren(root, "element")[0];
  assert.ok(element);
  assert.equal(element.ns, root.ns);
  assert.equal(
    attribute(element, "type", "http://www.w3.org/2001/XMLSchema-instance"),
    "BusinessActor",
  );
  assert.equal(attribute(element, "lang"), "en");
});

test("parseXml keeps line positions across CRLF comments and text", () => {
  const root = parseXml(
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\r\n<!--\r\nnote\r\n-->\r\n<model>\r\n  <name>A</name>\r\n</model>\r\n",
  );
  const name = elementChildren(root, "name")[0];
  assert.ok(name);
  assert.equal(directText(name), "A");
  assert.equal(name.line, 6);
});

test("parseXml rejects DOCTYPE, undeclared prefixes, mismatched tags, and non-UTF-8", () => {
  assert.throws(() => parseXml(`<!DOCTYPE model [<!ENTITY x "y">]><model/>`), XmlError);
  assert.throws(() => parseXml(`<m:model><m:name/></m:model>`), /undeclared namespace prefix 'm'/);
  assert.throws(() => parseXml(`<model><name></model>`), /does not match/);
  assert.throws(
    () => parseXml(`<?xml version="1.0" encoding="ISO-8859-1"?><model/>`),
    /unsupported XML encoding/,
  );
});
