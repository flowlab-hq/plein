# Homebrew formula for the Plein CLI (Apple Silicon).
# Chosen instead of a signed .pkg: this repo has no Apple signing identity.
# Intel Macs are out of scope (may work via Node, untested). No GUI.
#
# Tap this repository, then install (Homebrew provides Node — no npm by hand):
#   brew tap flowlab-hq/plein https://github.com/flowlab-hq/plein
#   brew install plein
class Plein < Formula
  desc "Check Plein ArchiMate model files"
  homepage "https://github.com/flowlab-hq/plein"
  license "MIT"
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

    broken = testpath/"broken.plein"
    broken.write <<~EOS
      plein {
        model {
          business-actor "Shipper" as shipper
    EOS
    assert_match(/expected|unterminated/, shell_output("#{bin}/plein check #{broken} 2>&1", 1))
  end
end
