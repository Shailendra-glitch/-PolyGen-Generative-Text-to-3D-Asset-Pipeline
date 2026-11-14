
# PolyGen: Generative Text-to-3D Asset Pipeline

PolyGen turns a text prompt into a game-ready 3D model. Type a sentence like *"A rusted medieval broadsword with a glowing blue sapphire in the hilt"* and get a textured, optimized `.glb` file that can be viewed in the browser and exported to Unity or Unreal Engine.

> Built as part of the Generative AI internship at Infotact Solutions.

## Status

**Week 1 in progress** (mesh generation and 3D canvas).

## How It Works

```
Text Prompt -> 3D Mesh (.obj) -> Texture -> Optimize (decimate) -> Export (.glb) -> Web Viewer
```

1. **Mesh generation:** a text-to-3D model creates the raw mesh.
2. **Texture synthesis:** Stable Diffusion (with depth maps / ControlNet) generates textures.
3. **Mesh optimization:** polygons are reduced so the asset runs in real-time engines.
4. **Export:** the mesh and textures are packed into a `.glb` file.
5. **Web viewer:** the user rotates and inspects the model in the browser.

## Tech Stack

| Area | Tools |
|---|---|
| 3D generation | TripoSR / Shap-E |
| Texturing | Stable Diffusion, ControlNet |
| Mesh processing | Python, trimesh, open3d |
| Backend | Python, FastAPI |
| Frontend | React, Three.js, react-three-fiber |
| Compute | Google Colab / Kaggle (GPU) |

## Project Structure

```
polygen-text-to-3d/
├── README.md
├── requirements.txt
├── docs/            # project plan, screenshots
├── backend/         # Python pipeline and API
├── frontend/        # React 3D viewer
└── notebooks/       # Colab / Kaggle notebooks
```

## Development Plan

| Week | AI / Python side | Web / 3D side |
|---|---|---|
| 1 | Text-to-3D mesh generation (`.obj`) | React app with react-three-fiber, load `.obj` |
| 2 | Texture generation with Stable Diffusion | UV unwrapping with trimesh |
| 3 | Mesh decimation (QEM), 500k to 10k polygons | PBR material support in viewer |
| 4 | Export to `.glb` / `.gltf` | UI polish, HDRI lighting |

## Getting Started

```bash
# clone the repo
git clone https://github.com/<your-username>/polygen-text-to-3d.git
cd polygen-text-to-3d

# backend setup
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

# frontend setup
cd frontend
npm install
npm run dev
```

The generation steps need a GPU. Run the notebooks in `notebooks/` on Google Colab or Kaggle.

## Deliverables

- Source code
- Project documentation
- Project report
- Presentation (PPT)
- Model evaluation results
- Final project demonstration

## Author

**Shailendra Prajapati**
Generative AI Intern, Infotact Solutions
