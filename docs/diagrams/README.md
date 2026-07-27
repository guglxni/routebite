# RouteBite diagrams

Editable sources (draw.io / diagrams.net) plus exported PNG/SVG for README and reviews.

| Diagram | Source | Export | Purpose |
|---------|--------|--------|---------|
| System architecture | [`system-architecture.drawio`](./system-architecture.drawio) | [`PNG`](./system-architecture.png) | C4-style container view |
| Order & fusion flow | [`order-fusion-flow.drawio`](./order-fusion-flow.drawio) | [`PNG`](./order-fusion-flow.png) | Journey → order → alignment BPMN-style |
| CI/CD & deploy | [`cicd-deployment.drawio`](./cicd-deployment.drawio) | [`PNG`](./cicd-deployment.png) | Actions gates + Vercel/Lightsail |
| Security boundaries | [`security-trust-boundaries.drawio`](./security-trust-boundaries.drawio) | [`PNG`](./security-trust-boundaries.png) | OWASP-aligned trust zones |

## Regenerate exports

```bash
DRAWIO="/Applications/draw.io.app/Contents/MacOS/draw.io"
cd docs/diagrams
for f in system-architecture order-fusion-flow cicd-deployment security-trust-boundaries; do
  "$DRAWIO" -x -f png -o "${f}.png" -b 20 -s 2 "${f}.drawio"
done
```

Open any `.drawio` in [diagrams.net](https://app.diagrams.net) or the desktop Draw.io app.
