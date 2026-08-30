import { toPng } from 'html-to-image';
import toast from 'react-hot-toast';

const CONTAINER_ID = 'schema-flow-chart-container';
const EXCLUDE_CLASS_CONTROLS = 'react-flow__controls';
const EXCLUDE_CLASS_MINIMAP = 'react-flow__minimap';
const DEFAULT_BG_COLOR = '#0a0a12';

export async function exportFlowImage(): Promise<void> {
  const container = document.getElementById(CONTAINER_ID) || (document.querySelector('.react-flow') as HTMLElement | null);
  if (!container) {
    toast.error('No se pudo encontrar el contenedor del diagrama');
    return;
  }

  try {
    const dataUrl = await toPng(container, {
      backgroundColor: DEFAULT_BG_COLOR,
      filter: (domNode) => {
        const className = (domNode as HTMLElement)?.className;
        if (typeof className === 'string') {
          if (className.includes(EXCLUDE_CLASS_CONTROLS) || className.includes(EXCLUDE_CLASS_MINIMAP)) {
            return false;
          }
        }
        return true;
      },
    });

    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `schema_flow_${Date.now()}.png`;
    link.click();
    toast.success('Diagrama exportado como PNG');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    toast.error(`Error al exportar la imagen PNG: ${message}`);
  }
}
