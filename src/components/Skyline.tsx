import { useEffect, useMemo, useRef, useState } from 'react';
import { useContributions } from '../contributionsContext';
import type { YearCalendar } from '../data/types';

const RAMP = ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'];

function level(count: number): number {
  if (count <= 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 9) return 3;
  return 4;
}

// Strong ease-out (cubic-bezier(0.23, 1, 0.32, 1) approximated as an exponential-out curve).
const easeOut = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

/**
 * 3D "skyline" of one year: each day is a column whose height is its contribution count.
 * Drag to orbit, scroll to zoom. The build-up plays once when the view opens; columns rise
 * week by week from January (a single left-to-right wave, ~900ms). Reduced motion renders the
 * finished state with no animation and no auto-rotation. three.js is loaded on demand, so the
 * dashboard pays nothing until the view is opened.
 */
function SkylineCanvas({ year, lostFor, today }: { year: YearCalendar; lostFor: (d: string) => { color: string } | null; today: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      const THREE = await import('three');
      const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
      if (disposed) return;

      let renderer: import('three').WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      } catch {
        setError('WebGL is not available in this browser.');
        return;
      }
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(el.clientWidth, el.clientHeight);
      el.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(32, el.clientWidth / el.clientHeight, 0.1, 500);
      const weeks = year.weeks.length;
      camera.position.set(weeks * 0.35, 26, 46);

      scene.add(new THREE.HemisphereLight(0xe6edf3, 0x0d1117, 1.1));
      const sun = new THREE.DirectionalLight(0xffffff, 1.6);
      sun.position.set(-20, 40, 25);
      scene.add(sun);

      const max = Math.max(1, ...year.weeks.flatMap((w) => w.days.map((d) => d.count)));
      const geometry = new THREE.BoxGeometry(0.86, 1, 0.86);
      geometry.translate(0, 0.5, 0); // grow from the floor
      const cells: Array<{ mesh: import('three').Mesh; height: number; delay: number }> = [];
      const group = new THREE.Group();
      year.weeks.forEach((week, col) => {
        week.days.forEach((day, row) => {
          if (Number(day.date.slice(0, 4)) !== year.year || day.date > today) return;
          const lost = day.count === 0 ? lostFor(day.date) : null;
          const height = day.count > 0 ? 0.25 + (Math.sqrt(day.count) / Math.sqrt(max)) * 9 : lost ? 0.35 : 0.08;
          const color = day.count > 0 ? RAMP[level(day.count)] : lost ? lost.color : RAMP[0];
          const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05 }));
          mesh.position.set(col - weeks / 2, 0, row - 3.5);
          mesh.scale.y = reduce ? height : 0.001;
          group.add(mesh);
          cells.push({ mesh, height, delay: (col / weeks) * 520 });
        });
      });
      scene.add(group);

      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(weeks + 4, 12),
        new THREE.MeshStandardMaterial({ color: 0x0d1117, roughness: 1 }),
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -0.01;
      scene.add(floor);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.minDistance = 18;
      controls.maxDistance = 110;
      controls.maxPolarAngle = Math.PI * 0.47;
      controls.autoRotate = !reduce;
      controls.autoRotateSpeed = 0.35;
      controls.addEventListener('start', () => { controls.autoRotate = false; });

      const start = performance.now();
      const BUILD = 380;
      let frame = 0;
      const tick = (now: number) => {
        if (!reduce) {
          for (const c of cells) {
            const t = Math.min(1, Math.max(0, (now - start - c.delay) / BUILD));
            c.mesh.scale.y = Math.max(0.001, c.height * easeOut(t));
          }
        }
        controls.update();
        renderer.render(scene, camera);
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);

      const resize = () => {
        camera.aspect = el.clientWidth / el.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(el.clientWidth, el.clientHeight);
      };
      const observer = new ResizeObserver(resize);
      observer.observe(el);

      cleanup = () => {
        cancelAnimationFrame(frame);
        observer.disconnect();
        controls.dispose();
        geometry.dispose();
        for (const c of cells) (c.mesh.material as import('three').Material).dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    })().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));

    return () => {
      disposed = true;
      cleanup();
    };
  }, [year, lostFor, today]);

  if (error) return <div className="skyline__error">{error}</div>;
  return <div ref={host} className="skyline__canvas" role="img" aria-label={`3D view of ${year.year} contributions. Drag to rotate, scroll to zoom.`} />;
}

/** Collapsible 3D view of the selected (or latest) year. */
export function Skyline() {
  const { data, scope, lostFor, today } = useContributions();
  const [open, setOpen] = useState(false);
  const year = useMemo(() => {
    const years = [...data.years].sort((a, b) => b.year - a.year);
    return (scope === 'all' ? years[0] : years.find((y) => y.year === scope)) ?? null;
  }, [data.years, scope]);

  if (!year) return null;
  return (
    <section className="skyline">
      <button type="button" className="export__toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? 'Hide 3D view' : `3D view of ${year.year}`}
      </button>
      {open && (
        <div className="skyline__body">
          <SkylineCanvas key={year.year} year={year} lostFor={lostFor} today={today} />
          <p className="skyline__hint">Drag to rotate · scroll to zoom</p>
        </div>
      )}
    </section>
  );
}
