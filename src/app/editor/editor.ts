import { Component, HostListener, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SmartDevice, SmartDeviceType } from '../models/smart-device';
import { PropertyService } from '../services/property';
import { EditorStateService, EditorTool, Point } from '../services/editor-state';
import { ApolloTargets, HomeAssistantService, HALight, HAEntity } from '../services/home-assistant';
import { DeviceInspector } from '../device-inspector/device-inspector';
import { Door } from '../models/door';
import { Window } from '../models/window';
import { Wall } from '../models/wall';
import { Room } from '../models/room';

import { isPointInsidePolygon } from '../utils/room-geometry';
import { connectWallEndpoint } from '../utils/wall-topology';
import { getWallPolygon } from '../utils/wall-geometry';

import {
  getClosestWall,
  snapAngle,
  snapPoint,
  getWallSide,
  getDrawingPoint,
  getDrawingGuide,
} from '../utils/editor-geometry';

import {
  getDoorTransform,
  getWindowTransform,
  getPlacementTransform as buildPlacementTransform,
} from '../utils/element-transforms';

import { PlacementPreview, getPlacementPreview } from '../utils/placement-utils';

import { calculateZoom, getSvgPoint } from '../utils/viewport';
import { getCursorClass } from '../utils/editor-utils';

@Component({
  selector: 'app-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, DeviceInspector],
  templateUrl: './editor.html',
  styleUrl: './editor.scss',
})
export class Editor implements OnInit {
  apolloTargets: ApolloTargets = {
    target1: { x: null, y: null },
    target2: { x: null, y: null },
    target3: { x: null, y: null },
  };

  lights: HALight[] = [];
  haEntities: HAEntity[] = [];

  haDevicesOpen = true;
  selectedHAEntity: HAEntity | null = null;

  toggleHADevices(): void {
    this.haDevicesOpen = !this.haDevicesOpen;
  }

  selectHAEntity(entity: HAEntity): void {
    this.selectedHAEntity = entity;

    console.log('Selected HA entity:', entity);
  }

  closeHAEntityDetails(): void {
    this.selectedHAEntity = null;
  }

  getHAIcon(domain: string): string {
    switch (domain) {
      case 'light':
        return '💡';

      case 'switch':
        return '🔌';

      case 'sensor':
        return '📊';

      case 'binary_sensor':
        return '◉';

      case 'camera':
        return '📷';

      case 'climate':
        return '🌡️';

      case 'media_player':
        return '🔊';

      case 'remote':
        return '📡';

      case 'cover':
        return '▣';

      case 'fan':
        return '🌀';

      default:
        return '◆';
    }
  }

  getHADomainName(domain: string): string {
    switch (domain) {
      case 'light':
        return 'Lights';

      case 'switch':
        return 'Switches';

      case 'sensor':
        return 'Sensors';

      case 'binary_sensor':
        return 'Binary Sensors';

      case 'camera':
        return 'Cameras';

      case 'climate':
        return 'Climate';

      case 'media_player':
        return 'Media Players';

      case 'remote':
        return 'Remotes';

      case 'cover':
        return 'Covers';

      case 'fan':
        return 'Fans';

      default:
        return 'Other';
    }
  }

  // ==================================================
  // HOME ASSISTANT DEVICE Type Mapper
  // ==================================================
  getSmartDeviceType(domain: string): SmartDeviceType {
    switch (domain) {
      case 'light':
        return 'light';

      case 'switch':
        return 'switch';

      case 'camera':
        return 'camera';

      case 'climate':
        return 'thermostat';

      case 'media_player':
        return 'speaker';

      case 'binary_sensor':
        return 'motion';

      case 'sensor':
        return 'sensor';

      default:
        return 'other';
    }
  }

  // ==================================================
  // HOME ASSISTANT DEVICE DRAGGING
  // ==================================================

  draggingHAEntity: HAEntity | null = null;
  haDragPreview: { x: number; y: number } | null = null;
  mouseCursor: Point | null = null;

  // ==================================================
  // DRAGGING
  // ==================================================

  draggingOriginalPoint: Point | null = null;
  drawingGuide: {
    horizontal: number | null;
    vertical: number | null;
  } | null = null;

  // ==================================================
  // VIEWPORT
  // ==================================================

  onWheel(event: WheelEvent) {
    event.preventDefault();

    const result = calculateZoom(
      event,
      event.currentTarget as SVGSVGElement,
      this.editorStateService.zoom,
      this.editorStateService.panX,
      this.editorStateService.panY,
    );

    this.editorStateService.zoom = result.zoom;
    this.editorStateService.panX = result.panX;
    this.editorStateService.panY = result.panY;
  }

  onCanvasMouseDown(event: MouseEvent) {
    // Middle mouse = always pan
    if (event.button === 1) {
      this.startPanning(event);
      return;
    }

    // Space + left mouse = pan
    if (event.button === 0 && this.editorStateService.spacePressed) {
      this.startPanning(event);
      return;
    }

    // Select tool + left mouse on empty canvas = pan
    if (
      event.button === 0 &&
      this.editorStateService.activeTool === 'select' &&
      event.target === event.currentTarget
    ) {
      this.startPanning(event);
    }
  }

  onCanvasMouseUp(event: MouseEvent) {
    if (this.editorStateService.isPanning) {
      this.editorStateService.isPanning = false;
      return;
    }

    this.stopDragging();
  }

  @HostListener('window:mouseup', ['$event'])
  onWindowMouseUp(event: MouseEvent) {
    if (this.draggingHAEntity) {
      const point = this.getSvgPointFromWindow(event);

      this.mouseCursor = {
        x: event.clientX,
        y: event.clientY,
      };

      this.dropHAEntity(point);

      return;
    }

    if (this.editorStateService.isPanning) {
      this.editorStateService.isPanning = false;
      return;
    }

    this.stopDragging();
  }

  @HostListener('window:mousemove', ['$event'])
  onWindowMouseMove(event: MouseEvent) {
    if (this.editorStateService.draggingDeviceId) {
      const point = this.getSvgPointFromWindow(event);

      this.mouseCursor = {
        x: event.clientX,
        y: event.clientY,
      };

      this.dragDevice(point);
      this.cdr.markForCheck();

      return;
    }
    if (this.draggingHAEntity) {
      this.haDragPreview = {
        x: event.clientX + 20,
        y: event.clientY + 20,
      };

      this.cdr.markForCheck();
      return;
    }
    if (
      !this.editorStateService.draggingWallId &&
      !this.editorStateService.draggingDoorId &&
      !this.editorStateService.draggingWindowId &&
      !this.editorStateService.draggingDeviceId &&
      !this.draggingDeviceRotation &&
      !this.editorStateService.isPanning
    ) {
      return;
    }

    const point = this.getSvgPointFromWindow(event);

    if (this.editorStateService.isPanning) {
      const dx = event.clientX - this.editorStateService.panStart.x;
      const dy = event.clientY - this.editorStateService.panStart.y;

      this.editorStateService.panX = this.editorStateService.panOrigin.x + dx;

      this.editorStateService.panY = this.editorStateService.panOrigin.y + dy;

      return;
    }

    if (this.editorStateService.draggingWallId) {
      this.dragWall(point);
      return;
    }

    if (this.editorStateService.draggingDoorId) {
      this.dragDoor(point);
      return;
    }

    if (this.editorStateService.draggingWindowId) {
      this.dragWindow(point);
      return;
    }

    if (this.editorStateService.draggingDeviceId) {
      this.dragDevice(point);
      return;
    }
    if (this.draggingDeviceRotation) {
      this.rotateDevice(point);
      return;
    }
  }

  getSvgPointFromWindow(event: MouseEvent): Point {
    const svg = document.querySelector('.floor-plan') as SVGSVGElement | null;

    if (!svg) {
      return {
        x: 0,
        y: 0,
      };
    }

    return getSvgPoint(
      event,
      svg,
      this.editorStateService.panX,
      this.editorStateService.panY,
      this.editorStateService.zoom,
    );
  }

  private startPanning(event: MouseEvent) {
    event.preventDefault();

    this.editorStateService.isPanning = true;

    this.editorStateService.panStart = {
      x: event.clientX,
      y: event.clientY,
    };

    this.editorStateService.panOrigin = {
      x: this.editorStateService.panX,
      y: this.editorStateService.panY,
    };
  }

  // ==================================================
  // Device Inspector positioning
  // ==================================================
  inspectorLocked = false;

  toggleInspectorLock(): void {
    this.inspectorLocked = !this.inspectorLocked;
  }

  get deviceInspectorPosition(): { x: number; y: number } | undefined {
    const device = this.getSelectedDevice();
    if (!device || !this.mouseCursor) {
      return undefined;
    }

    return {
      x: this.mouseCursor.x + 75,
      y: this.mouseCursor.y,
    };
  }
  // ==================================================
  // EDITOR STATE
  // ==================================================

  constructor(
    public propertyService: PropertyService,
    public editorStateService: EditorStateService,
    public homeAssistantService: HomeAssistantService,
    private cdr: ChangeDetectorRef,
  ) {}

  async ngOnInit() {
    this.propertyService.recalculateRooms();

    await this.homeAssistantService.connect();

    this.homeAssistantService.entities$.subscribe((entities) => {
      this.haEntities = entities;

      console.log('HA ENTITIES:', entities);

      this.cdr.markForCheck();
    });

    this.homeAssistantService.lights$.subscribe((lights) => {
      this.lights = lights;

      console.log('HA LIGHTS:', lights);

      this.cdr.markForCheck();
    });

    this.homeAssistantService.apolloTargets$.subscribe((targets) => {
      this.apolloTargets = targets;

      console.log('APOLLO:', targets.target1);

      this.cdr.markForCheck();
    });
  }

  get apolloTarget1Position(): Point | null {
    const device = this.propertyService.property.devices.find((d) => d.type === 'mmwave');

    if (!device) {
      return null;
    }

    const x = this.apolloTargets.target1.x;
    const y = this.apolloTargets.target1.y;

    // No valid target
    if (x === null || y === null) {
      return null;
    }

    const sensorX = -x;
    const sensorY = -y;

    const angle = (device.rotation * Math.PI) / 180;

    const rotatedX = sensorX * Math.cos(angle) - sensorY * Math.sin(angle);

    const rotatedY = sensorX * Math.sin(angle) + sensorY * Math.cos(angle);

    return {
      x: device.position.x + rotatedX,
      y: device.position.y + rotatedY,
    };
  }

  // ==================================================
  // TOOL
  // ==================================================

  setTool(tool: EditorTool) {
    this.editorStateService.activeTool = tool;
    this.drawingGuide = null;

    this.editorStateService.drawingStart = null;

    this.editorStateService.draggingWallId = null;
    this.editorStateService.draggingWallMove = false;
    this.editorStateService.draggingEndpoint = null;
    this.editorStateService.draggingDeviceId = null;

    this.draggingOriginalPoint = null;

    this.editorStateService.draggingDoorId = null;
    this.editorStateService.draggingWindowId = null;

    this.editorStateService.snapTarget = null;

    this.placementPreview = null;
    this.draggingDeviceRotation = false;
  }

  getCursorClass(): string {
    return getCursorClass(this.editorStateService.activeTool);
  }

  getSelectedType(): 'wall' | 'door' | 'window' | 'room' | 'device' | null {
    if (this.editorStateService.selectedWallId) {
      return 'wall';
    }

    if (this.editorStateService.selectedDoorId) {
      return 'door';
    }

    if (this.editorStateService.selectedWindowId) {
      return 'window';
    }

    if (this.editorStateService.selectedRoomId) {
      return 'room';
    }

    if (this.editorStateService.selectedDeviceId) {
      return 'device';
    }

    return null;
  }

  // ==================================================
  // Home Assistant Helper Functions
  // ==================================================

  getSelectedDevice(): SmartDevice | undefined {
    const deviceId = this.editorStateService.selectedDeviceId;

    if (!deviceId) {
      return undefined;
    }

    return this.propertyService.property.devices.find((device) => device.id === deviceId);
  }

  getSelectedDeviceLight(): HALight | undefined {
    const device = this.getSelectedDevice();

    if (!device?.entityId || device.type !== 'light') {
      return undefined;
    }

    return this.lights.find((light) => light.entityId === device.entityId);
  }

  toggleSelectedDevice() {
    const device = this.getSelectedDevice();

    if (!device?.entityId) {
      return;
    }

    this.homeAssistantService.toggle(device.entityId);
  }

  setSelectedLightBrightness(event: Event) {
    const device = this.getSelectedDevice();

    if (!device?.entityId) {
      return;
    }

    const input = event.target as HTMLInputElement;
    const brightness = Number(input.value);

    this.homeAssistantService.setLightBrightness(device.entityId, brightness);
  }

  // ==================================================
  // WALL DISPLAY
  // ==================================================

  getWallPoints(wall: Wall): string {
    return getWallPolygon(wall)
      .map((point) => `${point.x},${point.y}`)
      .join(' ');
  }

  // ==================================================
  // WALL DIMENSIONS
  // ==================================================

  wallLengthInput = '';
  wallDimensionFocused = false;
  wallDimensionPosition: Point | null = null;

  onWallDimensionFocus() {
    this.wallDimensionFocused = true;
  }

  onWallDimensionBlur() {
    setTimeout(() => {
      this.wallDimensionFocused = false;
    }, 100);
  }

  getSelectedWall(): Wall | undefined {
    const wallId = this.editorStateService.selectedWallId;

    if (!wallId) {
      return undefined;
    }

    return this.propertyService.property.walls.find((wall) => wall.id === wallId);
  }

  getWallLength(wall: Wall): number {
    return Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
  }

  formatWallLength(length: number): string {
    const totalInches = length;

    const feet = Math.floor(totalInches / 12);
    const inches = totalInches - feet * 12;

    if (Math.abs(inches) < 0.01) {
      return `${feet}'`;
    }

    return `${feet}' ${inches.toFixed(1)}"`;
  }

  parseWallLength(value: string): number | null {
    const input = value.trim();

    if (!input) {
      return null;
    }

    const feetMatch = input.match(/(\d+(?:\.\d+)?)\s*'/);
    const inchMatch = input.match(/(\d+(?:\.\d+)?)\s*"?$/);

    let feet = 0;
    let inches = 0;

    if (feetMatch) {
      feet = Number(feetMatch[1]);
    }

    if (inchMatch) {
      inches = Number(inchMatch[1]);
    }

    // Plain number = inches
    if (!feetMatch && !inchMatch) {
      const number = Number(input);

      return Number.isFinite(number) ? number : null;
    }

    return feet * 12 + inches;
  }

  applyWallLength(value: string, side: 'start' | 'end') {
    const wall = this.getSelectedWall();

    if (!wall) {
      return;
    }

    const newLength = this.parseWallLength(value);

    if (newLength === null || newLength <= 0) {
      return;
    }

    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;

    const currentLength = Math.hypot(dx, dy);

    if (currentLength === 0) {
      return;
    }

    const directionX = dx / currentLength;
    const directionY = dy / currentLength;

    if (side === 'start') {
      wall.start = {
        x: wall.end.x - directionX * newLength,
        y: wall.end.y - directionY * newLength,
      };
    } else {
      wall.end = {
        x: wall.start.x + directionX * newLength,
        y: wall.start.y + directionY * newLength,
      };
    }

    this.propertyService.wallChanged();
  }

  // ==================================================
  // SELECTION
  // ==================================================

  selectWall(wallId: string, event?: MouseEvent) {
    event?.stopPropagation();

    if (this.editorStateService.activeTool !== 'select') {
      return;
    }

    this.editorStateService.selectedWallId = wallId;
    this.editorStateService.selectedDoorId = null;
    this.editorStateService.selectedWindowId = null;
    this.editorStateService.selectedRoomId = null;

    const wall = this.propertyService.property.walls.find((wall) => wall.id === wallId);

    if (wall) {
      this.wallLengthInput = this.formatWallLength(this.getWallLength(wall));
    }

    if (event) {
      const svg = (event.currentTarget as SVGElement).ownerSVGElement;

      if (svg) {
        const rect = svg.getBoundingClientRect();

        this.wallDimensionPosition = {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        };
      }
    }
  }

  selectDoor(doorId: string, event: MouseEvent) {
    event.stopPropagation();

    if (this.editorStateService.activeTool !== 'select') {
      return;
    }

    this.editorStateService.selectedDoorId = doorId;
    this.editorStateService.selectedWallId = null;
    this.editorStateService.selectedWindowId = null;
    this.editorStateService.selectedRoomId = null;
  }

  selectWindow(windowId: string, event: MouseEvent) {
    event.stopPropagation();

    if (this.editorStateService.activeTool !== 'select') {
      return;
    }

    this.editorStateService.selectedWindowId = windowId;
    this.editorStateService.selectedDoorId = null;
    this.editorStateService.selectedWallId = null;
    this.editorStateService.selectedRoomId = null;
  }

  selectDevice(deviceId: string, event: MouseEvent) {
    event.stopPropagation();

    if (this.editorStateService.activeTool !== 'select') {
      return;
    }

    if (this.inspectorLocked) {
      return;
    }

    this.mouseCursor = {
      x: event.clientX,
      y: event.clientY,
    };

    this.editorStateService.selectedDeviceId = deviceId;

    this.editorStateService.selectedWallId = null;
    this.editorStateService.selectedDoorId = null;
    this.editorStateService.selectedWindowId = null;
    this.editorStateService.selectedRoomId = null;
  }

  selectRoom(roomId: string, event?: MouseEvent) {
    event?.stopPropagation();

    if (
      this.editorStateService.activeTool !== 'select' &&
      this.editorStateService.activeTool !== 'room'
    ) {
      return;
    }

    this.editorStateService.selectedRoomId = roomId;
    this.editorStateService.selectedWallId = null;
    this.editorStateService.selectedDoorId = null;
    this.editorStateService.selectedWindowId = null;
  }

  clearSelection() {
    this.editorStateService.selectedWallId = null;
    this.editorStateService.selectedRoomId = null;
    this.editorStateService.selectedDoorId = null;
    this.editorStateService.selectedWindowId = null;
    if (!this.inspectorLocked) {
      this.editorStateService.selectedDeviceId = null;
    }

    this.wallLengthInput = '';
    this.wallDimensionFocused = false;
    this.wallDimensionPosition = null;
  }

  // ==================================================
  // DELETE
  // ==================================================

  deleteSelected() {
    if (this.editorStateService.selectedDoorId) {
      this.deleteSelectedDoor();
      return;
    }

    if (this.editorStateService.selectedWindowId) {
      this.deleteSelectedWindow();
      return;
    }

    if (this.editorStateService.selectedWallId) {
      this.deleteSelectedWall();
    }
    if (this.editorStateService.selectedDeviceId) {
      this.deleteSelectedDevice();
      return;
    }
  }

  deleteSelectedDoor() {
    if (!this.editorStateService.selectedDoorId) {
      return;
    }

    this.propertyService.removeDoor(this.editorStateService.selectedDoorId);

    this.editorStateService.selectedDoorId = null;
  }

  deleteSelectedWindow() {
    if (!this.editorStateService.selectedWindowId) {
      return;
    }

    this.propertyService.removeWindow(this.editorStateService.selectedWindowId);

    this.editorStateService.selectedWindowId = null;
  }
  deleteSelectedDevice() {
    const deviceId = this.editorStateService.selectedDeviceId;
    if (!deviceId) {
      return;
    }

    const device = this.propertyService.property.devices.find((device) => device.id === deviceId);

    if (!device) {
      return;
    }

    const confirmed = confirm(`Are you sure you want to delete "${device.name}"?`);

    if (!confirmed) {
      return;
    }

    this.propertyService.removeDevice(deviceId);
    this.editorStateService.selectedDeviceId = null;
  }

  deleteSelectedWall() {
    if (!this.editorStateService.selectedWallId) {
      return;
    }

    this.propertyService.removeWall(this.editorStateService.selectedWallId);

    this.editorStateService.selectedWallId = null;
    this.wallLengthInput = '';
    this.wallDimensionFocused = false;
    this.wallDimensionPosition = null;
  }

  // ==================================================
  // ROOM
  // ==================================================

  isPointInsideRoom(point: Point, room: Room): boolean {
    return isPointInsidePolygon(point, room.polygon);
  }

  getSelectedRoom() {
    return this.propertyService.property.rooms.find(
      (room) => room.id === this.editorStateService.selectedRoomId,
    );
  }

  renameSelectedRoom(event: Event) {
    const input = event.target as HTMLInputElement;
    const room = this.getSelectedRoom();

    if (!room) {
      return;
    }

    room.name = input.value;
  }

  // ==================================================
  // Device Rotating
  // ==================================================

  startRotatingDevice(event: MouseEvent, deviceId: string) {
    event.stopPropagation();
    event.preventDefault();

    if (this.editorStateService.activeTool !== 'select') {
      return;
    }

    const device = this.propertyService.property.devices.find((device) => device.id === deviceId);

    if (!device) {
      return;
    }

    this.editorStateService.selectedDeviceId = deviceId;

    this.editorStateService.selectedWallId = null;
    this.editorStateService.selectedDoorId = null;
    this.editorStateService.selectedWindowId = null;
    this.editorStateService.selectedRoomId = null;

    this.draggingDeviceRotation = true;
  }

  rotateDevice(point: Point) {
    const device = this.propertyService.property.devices.find(
      (device) => device.id === this.editorStateService.selectedDeviceId,
    );

    if (!device) {
      return;
    }

    const dx = point.x - device.position.x;
    const dy = point.y - device.position.y;

    let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;

    if (angle < 0) {
      angle += 360;
    }

    if (this.editorStateService.shiftPressed) {
      angle = Math.round(angle / 45) * 45;
    }

    device.rotation = angle % 360;
  }

  // ==================================================
  // Device Dragging
  // ==================================================

  draggingDeviceRotation = false;

  get isDraggingWorkspaceDevice(): boolean {
    return this.editorStateService.draggingDeviceId !== null;
  }

  startDraggingDevice(event: MouseEvent, deviceId: string) {
    event.stopPropagation();
    event.preventDefault();

    if (this.editorStateService.activeTool !== 'select') {
      return;
    }

    const device = this.propertyService.property.devices.find((device) => device.id === deviceId);

    if (!device) {
      return;
    }

    this.mouseCursor = {
      x: event.clientX,
      y: event.clientY,
    };

    this.editorStateService.selectedDeviceId = deviceId;

    this.editorStateService.selectedWallId = null;
    this.editorStateService.selectedDoorId = null;
    this.editorStateService.selectedWindowId = null;
    this.editorStateService.selectedRoomId = null;

    this.editorStateService.draggingDeviceId = deviceId;
  }

  dragDevice(point: Point) {
    const device = this.propertyService.property.devices.find(
      (device) => device.id === this.editorStateService.draggingDeviceId,
    );

    if (!device) {
      return;
    }

    device.position = {
      x: point.x,
      y: point.y,
    };
  }

  // ==================================================
  // Home Assistant Device Dragging
  // ==================================================

  startDraggingHAEntity(event: MouseEvent, entity: HAEntity): void {
    event.preventDefault();
    event.stopPropagation();

    this.draggingHAEntity = entity;

    this.haDragPreview = {
      x: event.clientX + 20,
      y: event.clientY + 20,
    };

    console.log('HA DRAG START:', entity);
  }

  dropHAEntity(point: Point): void {
    const entity = this.draggingHAEntity;

    if (!entity) {
      return;
    }

    console.log('HA DROP:', entity, point);

    // --------------------------------
    // Prevent duplicates
    // --------------------------------

    const existing = this.propertyService.property.devices.find(
      (device) => device.entityId === entity.entityId,
    );

    if (existing) {
      console.log('HA ENTITY ALREADY PLACED:', entity.entityId);

      this.editorStateService.selectedDeviceId = existing.id;

      this.draggingHAEntity = null;
      this.haDragPreview = null;

      return;
    }

    // --------------------------------
    // Create SmartDevice
    // --------------------------------

    const device: SmartDevice = {
      id: crypto.randomUUID(),

      type: this.getSmartDeviceType(entity.domain),

      name: entity.name,

      position: {
        x: point.x,
        y: point.y,
      },

      rotation: 0,

      entityId: entity.entityId,

      enabled: true,
    };

    this.propertyService.addDevice(device);

    // --------------------------------
    // Select it
    // --------------------------------

    this.editorStateService.selectedDeviceId = device.id;

    this.editorStateService.selectedWallId = null;
    this.editorStateService.selectedDoorId = null;
    this.editorStateService.selectedWindowId = null;
    this.editorStateService.selectedRoomId = null;

    // --------------------------------
    // Cleanup
    // --------------------------------

    this.draggingHAEntity = null;
    this.haDragPreview = null;

    console.log('HA DEVICE ADDED:', device);
  }
  // ==================================================
  // DOOR DRAGGING
  // ==================================================

  startDraggingDoor(event: MouseEvent, doorId: string) {
    event.stopPropagation();

    if (this.editorStateService.activeTool !== 'select') {
      return;
    }

    this.editorStateService.selectedDoorId = doorId;
    this.editorStateService.selectedWallId = null;
    this.editorStateService.selectedRoomId = null;
    this.editorStateService.selectedWindowId = null;

    this.editorStateService.draggingDoorId = doorId;
  }

  dragDoor(point: Point) {
    const door = this.propertyService.property.doors.find(
      (door) => door.id === this.editorStateService.draggingDoorId,
    );

    if (!door) {
      return;
    }

    const result = getClosestWall(this.propertyService.property.walls, point);

    if (!result.wall) {
      return;
    }

    const attachDistance = 40;

    if (result.distance > attachDistance) {
      this.editorStateService.snapTarget = null;
      return;
    }

    door.wallId = result.wall.id;
    door.position = result.position;

    this.editorStateService.snapTarget = {
      x: result.wall.start.x + (result.wall.end.x - result.wall.start.x) * result.position,

      y: result.wall.start.y + (result.wall.end.y - result.wall.start.y) * result.position,
    };
  }

  // ==================================================
  // WINDOW DRAGGING
  // ==================================================

  startDraggingWindow(event: MouseEvent, windowId: string) {
    event.stopPropagation();

    if (this.editorStateService.activeTool !== 'select') {
      return;
    }

    this.editorStateService.selectedWindowId = windowId;
    this.editorStateService.selectedDoorId = null;
    this.editorStateService.selectedWallId = null;
    this.editorStateService.selectedRoomId = null;

    this.editorStateService.draggingWindowId = windowId;
  }

  dragWindow(point: Point) {
    const window = this.propertyService.property.windows.find(
      (window) => window.id === this.editorStateService.draggingWindowId,
    );

    if (!window) {
      return;
    }

    const result = getClosestWall(this.propertyService.property.walls, point);

    if (!result.wall) {
      return;
    }

    const attachDistance = 40;

    if (result.distance > attachDistance) {
      this.editorStateService.snapTarget = null;
      return;
    }

    window.wallId = result.wall.id;
    window.position = result.position;

    this.editorStateService.snapTarget = {
      x: result.wall.start.x + (result.wall.end.x - result.wall.start.x) * result.position,

      y: result.wall.start.y + (result.wall.end.y - result.wall.start.y) * result.position,
    };
  }

  // ==================================================
  // WALL DRAGGING
  // ==================================================

  startDraggingWall(event: MouseEvent, wallId: string) {
    event.stopPropagation();
    event.preventDefault();

    if (this.editorStateService.activeTool !== 'select') {
      return;
    }

    const wall = this.propertyService.property.walls.find((wall) => wall.id === wallId);

    if (!wall) {
      return;
    }

    this.editorStateService.selectedWallId = wallId;
    this.editorStateService.selectedDoorId = null;
    this.editorStateService.selectedWindowId = null;
    this.editorStateService.selectedRoomId = null;

    this.wallLengthInput = this.formatWallLength(this.getWallLength(wall));

    this.editorStateService.draggingWallId = wallId;
    this.editorStateService.draggingEndpoint = null;
    this.editorStateService.draggingWallMove = true;

    this.draggingOriginalPoint = this.getSvgPoint(event);
  }

  startDragging(event: MouseEvent, wallId: string, endpoint: 'start' | 'end') {
    event.stopPropagation();
    event.preventDefault();

    if (this.editorStateService.activeTool !== 'select') {
      return;
    }

    const wall = this.propertyService.property.walls.find((wall) => wall.id === wallId);

    if (!wall) {
      return;
    }

    this.editorStateService.selectedWallId = wallId;
    this.editorStateService.selectedDoorId = null;
    this.editorStateService.selectedWindowId = null;
    this.editorStateService.selectedRoomId = null;

    this.wallLengthInput = this.formatWallLength(this.getWallLength(wall));

    this.editorStateService.draggingWallId = wallId;
    this.editorStateService.draggingEndpoint = endpoint;
    this.editorStateService.draggingWallMove = false;

    this.draggingOriginalPoint = {
      ...wall[endpoint],
    };
  }

  dragWall(point: Point) {
    if (!this.editorStateService.draggingWallId) {
      return;
    }

    const wall = this.propertyService.property.walls.find(
      (wall) => wall.id === this.editorStateService.draggingWallId,
    );

    if (!wall) {
      return;
    }

    // --------------------------------
    // Moving the entire wall
    // --------------------------------

    if (!this.editorStateService.draggingEndpoint) {
      if (!this.draggingOriginalPoint) {
        return;
      }

      const dx = point.x - this.draggingOriginalPoint.x;
      const dy = point.y - this.draggingOriginalPoint.y;

      wall.start = {
        x: wall.start.x + dx,
        y: wall.start.y + dy,
      };

      wall.end = {
        x: wall.end.x + dx,
        y: wall.end.y + dy,
      };

      this.draggingOriginalPoint = point;
      this.editorStateService.snapTarget = null;

      return;
    }

    // --------------------------------
    // Moving one endpoint
    // --------------------------------

    const draggingEndpoint = this.editorStateService.draggingEndpoint;

    if (!draggingEndpoint) {
      return;
    }

    const fixedPoint = draggingEndpoint === 'start' ? wall.end : wall.start;

    // --------------------------------
    // Clean geometry / angle snapping
    // --------------------------------

    const drawingPoint = getDrawingPoint(
      fixedPoint,
      point,
      this.propertyService.property.walls,
      this.editorStateService.shiftPressed,
      this.editorStateService.angleSnap,
      this.editorStateService.snapDistance,
    );

    // --------------------------------
    // Architectural alignment guide
    // --------------------------------

    this.drawingGuide = getDrawingGuide(
      point,
      this.propertyService.property.walls,
      this.editorStateService.snapDistance,
      fixedPoint,
      this.editorStateService.draggingWallId,
    );

    // --------------------------------
    // Point snapping
    // --------------------------------

    const snappedPoint = snapPoint(
      this.propertyService.property.walls,
      drawingPoint,
      this.editorStateService.snapDistance,
      this.editorStateService.draggingWallId,
    );

    if (snappedPoint.x !== drawingPoint.x || snappedPoint.y !== drawingPoint.y) {
      this.editorStateService.snapTarget = snappedPoint;
    } else {
      this.editorStateService.snapTarget = null;
    }

    // --------------------------------
    // Apply endpoint
    // --------------------------------

    wall[draggingEndpoint] = {
      x: snappedPoint.x,
      y: snappedPoint.y,
    };
  }

  // ==================================================
  // MOUSE
  // ==================================================

  onMouseMove(event: MouseEvent) {
    const point = this.getSvgPoint(event);

    // --------------------------------
    // Viewport panning
    // --------------------------------

    if (this.editorStateService.isPanning) {
      const dx = event.clientX - this.editorStateService.panStart.x;
      const dy = event.clientY - this.editorStateService.panStart.y;

      this.editorStateService.panX = this.editorStateService.panOrigin.x + dx;
      this.editorStateService.panY = this.editorStateService.panOrigin.y + dy;

      return;
    }

    // --------------------------------
    // Door / Window placement preview
    // --------------------------------

    if (
      this.editorStateService.activeTool === 'door' ||
      this.editorStateService.activeTool === 'window'
    ) {
      this.editorStateService.mousePosition = point;
      this.updatePlacementPreview(point);
      return;
    }

    // --------------------------------
    // Dragging a door
    // --------------------------------

    if (this.editorStateService.draggingDoorId) {
      this.dragDoor(point);
      return;
    }

    // --------------------------------
    // Dragging a window
    // --------------------------------

    if (this.editorStateService.draggingWindowId) {
      this.dragWindow(point);
      return;
    }

    // --------------------------------
    // Drawing a new wall
    // --------------------------------

    if (this.editorStateService.activeTool === 'wall' && this.editorStateService.drawingStart) {
      const drawingStart = this.editorStateService.drawingStart;

      // --------------------------------
      // Clean geometry / angle snapping
      // --------------------------------

      const drawingPoint = getDrawingPoint(
        drawingStart,
        point,
        this.propertyService.property.walls,
        this.editorStateService.shiftPressed,
        this.editorStateService.angleSnap,
        this.editorStateService.snapDistance,
      );

      // --------------------------------
      // Architectural alignment guide
      // --------------------------------

      this.drawingGuide = getDrawingGuide(
        point,
        this.propertyService.property.walls,
        this.editorStateService.snapDistance,
        drawingStart,
      );

      // --------------------------------
      // Snap indicator
      // --------------------------------

      const snappedPoint = snapPoint(
        this.propertyService.property.walls,
        drawingPoint,
        this.editorStateService.snapDistance,
      );

      if (snappedPoint.x !== drawingPoint.x || snappedPoint.y !== drawingPoint.y) {
        this.editorStateService.snapTarget = snappedPoint;
      } else {
        this.editorStateService.snapTarget = null;
      }

      // --------------------------------
      // Preview line endpoint
      // --------------------------------

      this.editorStateService.mousePosition = this.editorStateService.snapTarget ?? drawingPoint;

      return;
    }

    // --------------------------------
    // Normal mouse movement
    // --------------------------------

    this.editorStateService.mousePosition = point;
    this.drawingGuide = null;

    // --------------------------------
    // Existing wall endpoint dragging
    // --------------------------------

    if (this.editorStateService.draggingWallId && this.editorStateService.draggingEndpoint) {
      this.dragWall(point);
      return;
    }

    this.editorStateService.snapTarget = null;
    this.drawingGuide = null;
  }

  getSvgPoint(event: MouseEvent): Point {
    const target = event.currentTarget as SVGElement;

    const svg = target instanceof SVGSVGElement ? target : target.ownerSVGElement;

    if (!svg) {
      return {
        x: 0,
        y: 0,
      };
    }

    return getSvgPoint(
      event,
      svg,
      this.editorStateService.panX,
      this.editorStateService.panY,
      this.editorStateService.zoom,
    );
  }

  // ==================================================
  // PLACEMENT PREVIEW
  // ==================================================

  placementPreview: PlacementPreview | null = null;

  getPlacementTransform(): string {
    if (!this.placementPreview) {
      return '';
    }

    return buildPlacementTransform(this.placementPreview, this.propertyService.property.walls);
  }

  updatePlacementPreview(point: Point) {
    if (
      this.editorStateService.activeTool !== 'door' &&
      this.editorStateService.activeTool !== 'window'
    ) {
      this.placementPreview = null;
      return;
    }

    this.placementPreview = getPlacementPreview(this.propertyService.property.walls, point);
  }

  // ==================================================
  // MOUSE CLICK
  // ==================================================

  onSvgClick(event: MouseEvent) {
    switch (this.editorStateService.activeTool) {
      case 'wall':
        this.handleWallClick(event);
        break;

      case 'room':
        this.handleRoomClick(event);
        break;

      case 'door':
        this.handleDoorClick(event);
        break;

      case 'window':
        this.handleWindowClick(event);
        break;

      case 'device':
        this.handleDeviceClick(event);
        break;

      case 'select':
        this.clearSelection();
        break;
    }
  }

  // ==================================================
  // WALL CREATION
  // ==================================================

  handleWallClick(event: MouseEvent) {
    const point = this.getSvgPoint(event);

    if (!this.editorStateService.drawingStart) {
      const result = connectWallEndpoint(
        this.propertyService.property.walls,
        point,
        this.editorStateService.snapDistance,
      );

      if (result.split) {
        this.propertyService.splitWall(result.split.wall.id, result.split.point);
      }

      this.editorStateService.drawingStart = result.point;

      return;
    }

    const drawingPoint = getDrawingPoint(
      this.editorStateService.drawingStart,
      point,
      this.propertyService.property.walls,
      this.editorStateService.shiftPressed,
      this.editorStateService.angleSnap,
      this.editorStateService.snapDistance,
    );

    const result = connectWallEndpoint(
      this.propertyService.property.walls,
      drawingPoint,
      this.editorStateService.snapDistance,
    );

    if (result.split) {
      this.propertyService.splitWall(result.split.wall.id, result.split.point);
    }

    const finalPoint = result.point;

    if (
      finalPoint.x === this.editorStateService.drawingStart.x &&
      finalPoint.y === this.editorStateService.drawingStart.y
    ) {
      return;
    }

    const newWall: Wall = {
      id: crypto.randomUUID(),
      start: {
        ...this.editorStateService.drawingStart,
      },
      end: {
        ...finalPoint,
      },
      thickness: 4,
      height: 96,
    };

    this.propertyService.addWall(newWall);

    this.editorStateService.drawingStart = null;
    this.editorStateService.snapTarget = null;
  }

  // ==================================================
  // DOOR CREATION
  // ==================================================

  getDoorTransform(door: Door): string {
    return getDoorTransform(door, this.propertyService.property.walls);
  }

  handleDoorClick(event: MouseEvent) {
    const point = this.getSvgPoint(event);

    const result = getClosestWall(this.propertyService.property.walls, point);

    if (!result.wall) {
      return;
    }

    if (result.position < 0.1 || result.position > 0.9) {
      return;
    }

    const side = getWallSide(result.wall, point);

    const door: Door = {
      id: crypto.randomUUID(),
      wallId: result.wall.id,
      position: result.position,
      width: 80,
      swing: 'right',
      open: false,
      side,
    };

    this.propertyService.addDoor(door);
  }

  // ==================================================
  // WINDOW CREATION
  // ==================================================

  getWindowTransform(window: Window): string {
    return getWindowTransform(window, this.propertyService.property.walls);
  }

  handleWindowClick(event: MouseEvent) {
    const point = this.getSvgPoint(event);

    const result = getClosestWall(this.propertyService.property.walls, point);

    if (!result.wall) {
      return;
    }

    if (result.position < 0.1 || result.position > 0.9) {
      return;
    }

    const side = getWallSide(result.wall, point);

    const window: Window = {
      id: crypto.randomUUID(),
      wallId: result.wall.id,
      position: result.position,
      width: 100,
      height: 48,
      side,
    };

    this.propertyService.addWindow(window);
  }

  // ==================================================
  // OTHER TOOLS
  // ==================================================

  handleRoomClick(event: MouseEvent) {
    const point = this.getSvgPoint(event);

    const room = this.propertyService.property.rooms.find((room) =>
      this.isPointInsideRoom(point, room),
    );

    if (!room) {
      return;
    }

    this.selectRoom(room.id);
  }

  handleDeviceClick(event: MouseEvent) {
    const point = this.getSvgPoint(event);
    const light = this.selectedHAEntity;

    const device: SmartDevice = {
      id: crypto.randomUUID(),

      type: light ? 'light' : 'mmwave',
      name: light ? light.name : 'New Device',

      position: {
        ...point,
      },

      rotation: 0,
      entityId: light?.entityId,
      enabled: true,
    };

    this.propertyService.addDevice(device);

    this.editorStateService.selectedDeviceId = device.id;

    this.editorStateService.selectedWallId = null;
    this.editorStateService.selectedDoorId = null;
    this.editorStateService.selectedWindowId = null;
    this.editorStateService.selectedRoomId = null;

    this.editorStateService.activeTool = 'select';
    this.selectedHAEntity = null;
  }

  // ==================================================
  // DRAG END
  // ==================================================

  stopDragging() {
    // Whole wall drag
    if (this.editorStateService.draggingWallId && this.editorStateService.draggingWallMove) {
      const wallId = this.editorStateService.draggingWallId;

      this.propertyService.wallChanged();

      this.propertyService.resolveWallTopology(wallId, 'start');

      this.propertyService.resolveWallTopology(wallId, 'end');
    }

    // Endpoint drag
    else if (this.editorStateService.draggingWallId && this.editorStateService.draggingEndpoint) {
      this.propertyService.resolveWallTopology(
        this.editorStateService.draggingWallId,
        this.editorStateService.draggingEndpoint,
      );
    }

    this.editorStateService.draggingWallId = null;
    this.editorStateService.draggingWallMove = false;
    this.editorStateService.draggingEndpoint = null;
    this.editorStateService.draggingDeviceId = null;
    this.draggingDeviceRotation = false;

    this.draggingOriginalPoint = null;
    this.mouseCursor = null;

    this.editorStateService.draggingDoorId = null;
    this.editorStateService.draggingWindowId = null;

    this.editorStateService.snapTarget = null;

    if (
      this.editorStateService.activeTool === 'door' ||
      this.editorStateService.activeTool === 'window'
    ) {
      this.placementPreview = null;
    }
  }

  // ==================================================
  // KEYBOARD
  // ==================================================

  @HostListener('window:keydown', ['$event'])
  handleKeyboard(event: KeyboardEvent) {
    if (event.key === 'Shift') {
      this.editorStateService.shiftPressed = true;
    }

    if (event.code === 'Space') {
      this.editorStateService.spacePressed = true;
    }

    const target = event.target as HTMLElement;

    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }

    if (
      (event.key === 'Delete' || event.key === 'Backspace') &&
      this.editorStateService.activeTool === 'select'
    ) {
      this.deleteSelected();
    }
  }

  @HostListener('window:keyup', ['$event'])
  handleKeyboardUp(event: KeyboardEvent) {
    if (event.key === 'Shift') {
      this.editorStateService.shiftPressed = false;
    }

    if (event.code === 'Space') {
      this.editorStateService.spacePressed = false;
    }
  }
}
