# Homebrew formula for the Plein CLI (Apple Silicon).
# Chosen instead of a signed .pkg: this repo has no Apple signing identity.
# Intel Macs are out of scope (may work via Node, untested). No GUI.
#
# Tap this repository, then install (Homebrew provides Node — no npm by hand):
#   brew tap flowlab-hq/plein https://github.com/flowlab-hq/plein
#   brew install plein
class Plein < Formula
  desc "Check, inspect, format, render, and exchange Plein ArchiMate model files"
  homepage "https://github.com/flowlab-hq/plein"
  # SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
  # Additional Competing Use terms in LICENSE. GitHub may show Other / View license.
  license :cannot_represent
  version "0.1.0"

  # No tagged release yet; install latest main. Pin url + sha256 when tagging.
  url "https://github.com/flowlab-hq/plein.git", branch: "main"
  head "https://github.com/flowlab-hq/plein.git", branch: "main"

  depends_on "node"

  livecheck do
    skip "Installs from the main branch until a tagged release exists"
  end

  def install
    system "npm", "ci"
    system "npm", "run", "build"

    # ESM loads via package.json "type": "module" walking up from dist/.
    libexec.install "dist", "package.json"

    (bin/"plein").write <<~EOS
      #!/bin/bash
      exec "#{Formula["node"].opt_bin}/node" "#{libexec}/dist/cli.js" "$@"
    EOS
    chmod 0755, bin/"plein"
  end

  def caveats
    <<~EOS
      Plein is a command-line tool (no GUI).
      Apple Silicon is the supported Mac target. Intel Macs are out of scope.
      plein inspect writes the loaded model as JSON (elements, relationships, and views).
      plein format rewrites .plein to a stable canonical layout (stdout, or --write / -o).
      plein export writes a self-contained HTML or SVG file you can open in a browser.
      plein import and plein export-open-exchange read and write the documented Open Exchange subset.
    EOS
  end

  test do
    golden = testpath/"golden.plein"
    golden.write <<~EOS
      plein {
        model {
          business-actor "Shipper" as shipper
          business-service "Booking service" as booking
          shipper -> booking: serving
        }
      }
    EOS
    assert_match(/^ok /, shell_output("#{bin}/plein check #{golden}"))

    inspected = shell_output("#{bin}/plein inspect #{golden}")
    assert_match(/"keyword": "businessActor"/, inspected)
    assert_match(/"id": "shipper"/, inspected)
    assert_match(/"type": "serves"/, inspected)
    assert_match(/"source": "shipper"/, inspected)
    assert_match(/"target": "booking"/, inspected)
    assert_match(/"views": \[\]/, inspected)

    messy = testpath/"messy.plein"
    messy.write <<~EOS
      model {
        businessActor "Shipper" as shipper
        business-service "Booking service" as booking
        shipper serves booking
      }
    EOS
    formatted = shell_output("#{bin}/plein format #{messy}")
    assert_match(/business-actor "Shipper" as shipper/, formatted)
    assert_match(/shipper -> booking: serving/, formatted)
    assert_equal formatted, shell_output("#{bin}/plein format #{messy}")
    system bin/"plein", "format", "--write", messy
    assert_match(/^ok /, shell_output("#{bin}/plein format --check #{messy}"))

    broken = testpath/"broken.plein"
    broken.write <<~EOS
      plein {
        model {
          business-actor "Shipper" as shipper
    EOS
    assert_match(/expected|unterminated/, shell_output("#{bin}/plein check #{broken} 2>&1", 1))
    assert_match(/expected|unterminated/, shell_output("#{bin}/plein inspect #{broken} 2>&1", 1))

    export_model = testpath/"export.plein"
    export_model.write <<~EOS
      plein {
        model {
          business-actor "Shipper" as shipper
        }
        views {
          view booking-context {
            title "Booking context"
            include shipper
          }
        }
      }
    EOS
    html = shell_output("#{bin}/plein export #{export_model} --view booking-context --format html")
    assert_match(/<!DOCTYPE html>/, html)
    assert_match(/data-view="booking-context"/, html)
    assert_no_match(/<script/, html)

    view_json = shell_output("#{bin}/plein inspect #{export_model}")
    assert_match(/"name": "booking-context"/, view_json)
    assert_match(/"title": "Booking context"/, view_json)
    assert_match(/"includes": \[\s*"shipper"/, view_json)

    xml = shell_output("#{bin}/plein export-open-exchange #{export_model}")
    assert_match(/xsi:type="BusinessActor"/, xml)
    assert_match(/elementRef="shipper"/, xml)
    assert_match(%r{http://www.opengroup.org/xsd/archimate/3.0/}, xml)
  end
end
