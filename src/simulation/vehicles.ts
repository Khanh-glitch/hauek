import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { disposeScene } from "./scene-kit";

export interface ParkedBikeSlot {
  parent: T.Group;
  x: number;
  y: number;
  z: number;
  ry: number;
}

function normalizeVehicleToGround(
  src: T.Object3D,
  targetLength: number,
  facePosZ: boolean,
  castShadow = true,
): { root: T.Group; wheels: T.Object3D[] } {
  const clone = src.clone(true);
  const root = new T.Group();
  root.add(clone);
  const wheels: T.Object3D[] = [];
  clone.traverse((o) => {
    if (o instanceof T.Mesh) {
      o.castShadow = castShadow;
      o.receiveShadow = true;
    }
    if (/^wheel_/i.test(o.name)) wheels.push(o);
  });

  const bounds = new T.Box3().setFromObject(clone, true);
  const size = bounds.getSize(new T.Vector3());
  if (size.x > size.z) clone.rotation.y += Math.PI / 2;
  if (facePosZ) clone.rotation.y += Math.PI;
  clone.updateMatrixWorld(true);
  bounds.setFromObject(clone, true);
  const mid = bounds.getCenter(new T.Vector3());
  const len = Math.max(bounds.max.z - bounds.min.z, 0.5);
  const sc = targetLength / len;
  clone.position.set(-mid.x, -bounds.min.y, -mid.z);
  root.scale.setScalar(sc);
  return { root, wheels };
}

export function streetVehicles(
  traffic: { body: T.Group; direction: number }[],
  parkedSuv: T.Group,
  parkedVan?: T.Group,
  movingTruck?: T.Group,
  parkedBikes: ParkedBikeSlot[] = [],
  onAssetLoaded?: (obj: T.Object3D) => void,
) {
  const load = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  let disposed = false;
  const moving: { root: T.Group; wheels: T.Object3D[]; z: number; wheelRadius: number }[] = [];

  async function addRider(file: string, slots: number[]) {
    const gltf = await load.loadAsync(`/models/${file}.optimized.glb`);
    if (disposed) {
      disposeScene(gltf.scene);
      return;
    }
    slots.forEach((index) => {
      const host = traffic[index]?.body;
      if (!host) return;
      const root = new T.LOD();
      const wheels: T.Object3D[] = [];
      for (let i = 0; i < 3; i++) {
        const item = gltf.scene.getObjectByName("BikeRider_LOD" + i)?.clone(true);
        if (!item) continue;
        item.traverse((o) => {
          if (o instanceof T.Mesh) {
            o.castShadow = i < 2;
            o.receiveShadow = i === 0;
          }
          if (/^FrontWheel|^RearWheel/.test(o.name)) wheels.push(o);
        });
        root.addLevel(item, [0, 12, 28][i], 0.12);
      }
      if (root.levels.length) {
        host.children.forEach((c) => (c.visible = false));
        root.scale.setScalar(1.9);
        root.rotation.y = Math.PI;
        root.addLevel(new T.Object3D(), 68, 0.1);
        host.add(root);
        moving.push({ root: host, wheels, z: host.position.z, wheelRadius: 0.27 });
      }
    });
  }

  async function addRealisticMotorbikes(slots: number[]) {
    const [motoGltf, pcxGltf, cubGltf] = await Promise.all([
      load.loadAsync("/models/vehicles/motorbike.glb").catch(() => null),
      load.loadAsync("/models/bike-pcx.optimized.glb").catch(() => null),
      load.loadAsync("/models/bike-supercub.optimized.glb").catch(() => null),
    ]);
    if (disposed) {
      if (motoGltf) disposeScene(motoGltf.scene);
      if (pcxGltf) disposeScene(pcxGltf.scene);
      if (cubGltf) disposeScene(cubGltf.scene);
      return;
    }

    // Moving realistic PBR motorbikes on Lý Thái Tổ
    if (motoGltf) {
      slots.forEach((index) => {
        const host = traffic[index]?.body;
        if (!host) return;
        const { root, wheels } = normalizeVehicleToGround(motoGltf.scene, 2.08, true, false);
        host.children.forEach((c) => (c.visible = false));
        host.add(root);
        onAssetLoaded?.(root);
        moving.push({ root: host, wheels, z: host.position.z, wheelRadius: 0.3 });
      });
    }

    // Replace ALL procedural parked sidewalk scooters along Lý Thái Tổ with REAL 3D GLB motorbikes!
    const pool = [
      pcxGltf ? { scene: pcxGltf.scene, len: 1.92, flip: false } : null,
      cubGltf ? { scene: cubGltf.scene, len: 1.84, flip: false } : null,
      motoGltf ? { scene: motoGltf.scene, len: 2.04, flip: true } : null,
    ].filter((x): x is { scene: T.Group; len: number; flip: boolean } => x !== null);

    if (pool.length > 0 && parkedBikes.length > 0) {
      parkedBikes.forEach((slot, i) => {
        const pick = pool[i % pool.length];
        const { root } = normalizeVehicleToGround(pick.scene, pick.len, pick.flip, false);
        root.position.set(slot.x, slot.y, slot.z);
        root.rotation.set(0, slot.ry, -0.05);
        root.matrixAutoUpdate = false;
        root.updateMatrix();
        slot.parent.add(root);
        if (i < pool.length) onAssetLoaded?.(root);
      });
    }
  }

  async function addRealisticFourWheelers() {
    const [taxiGltf, suvGltf, vanGltf, truckGltf] = await Promise.all([
      load.loadAsync("/models/vehicles/taxi_corolla.glb").catch(() => null),
      load.loadAsync("/models/vehicles/savanna.glb").catch(() => null),
      load.loadAsync("/models/vehicles/mula_van.glb").catch(() => null),
      load.loadAsync("/models/vehicles/mula_van.glb").catch(() => null),
    ]);
    if (disposed) {
      if (taxiGltf) disposeScene(taxiGltf.scene);
      if (suvGltf) disposeScene(suvGltf.scene);
      if (vanGltf) disposeScene(vanGltf.scene);
      if (truckGltf) disposeScene(truckGltf.scene);
      return;
    }

    // Moving Saigon Corolla Taxi on Lý Thái Tổ lane
    const taxiHost = traffic[7]?.body;
    if (taxiHost && taxiGltf) {
      const { root, wheels } = normalizeVehicleToGround(taxiGltf.scene, 4.45, true, false);
      taxiHost.children.forEach((c) => (c.visible = false));
      taxiHost.add(root);
      onAssetLoaded?.(root);
      moving.push({ root: taxiHost, wheels, z: taxiHost.position.z, wheelRadius: 0.34 });
    }

    // Parked realistic urban SUV beside Lý Thái Tổ Bus Station curb
    if (suvGltf) {
      const { root: suvRoot } = normalizeVehicleToGround(suvGltf.scene, 4.55, false, false);
      parkedSuv.children.forEach((c) => (c.visible = false));
      parkedSuv.add(suvRoot);
      onAssetLoaded?.(suvRoot);
    }

    // Parked realistic commercial van beside Lý Thái Tổ curb (replaces procedural box van!)
    if (parkedVan && vanGltf) {
      const { root: vanRoot } = normalizeVehicleToGround(vanGltf.scene, 4.75, false, false);
      parkedVan.children.forEach((c) => (c.visible = false));
      parkedVan.add(vanRoot);
      onAssetLoaded?.(vanRoot);
    }

    // Moving realistic 6x6 truck on Lý Thái Tổ (replaces procedural box truck!)
    if (movingTruck && truckGltf) {
      const { root: truckRoot, wheels } = normalizeVehicleToGround(truckGltf.scene, 6.4, false, false);
      movingTruck.children.forEach((c) => (c.visible = false));
      movingTruck.add(truckRoot);
      onAssetLoaded?.(truckRoot);
      moving.push({ root: movingTruck, wheels, z: movingTruck.position.z, wheelRadius: 0.48 });
    }
  }

  void Promise.all([
    addRider("bike-rider", [1, 3]),
    addRider("baothu", [0, 4, 6]),
    addRealisticMotorbikes([2, 5]),
    addRealisticFourWheelers(),
  ]).catch(console.error);

  return {
    update() {
      for (const a of moving) {
        const dz = Math.abs(a.root.position.z - a.z);
        if (dz < 8) {
          for (const w of a.wheels) w.rotation.x += dz / a.wheelRadius;
        }
        a.z = a.root.position.z;
      }
    },
    dispose() {
      disposed = true;
    },
  };
}
