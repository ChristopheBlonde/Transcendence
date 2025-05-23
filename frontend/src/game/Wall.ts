import { GameObject } from './GameObject.ts';
import { StateManager } from './StateManager.ts';
import { MeshBuilder, Vector3, Color3 } from '@babylonjs/core';

interface WallProps {
  color?: Color3;
  alpha?: number;
}

export class Wall extends GameObject {

  constructor(
    game: StateManager,
    name: 'left' | 'right' | 'front' | 'back',
    pos: Vector3,
    props?: WallProps
  ) {
    super(game);
    const { width, height, depth } = this.game['conf'].wall.wallPositions[name];

    this.mesh = MeshBuilder.CreateBox(
      name,
      { width, height, depth },
      this.scene
    );

    this.mesh.position = pos;

    if (props?.color) {
      this.setColor(props.color, props.alpha);
    }
  }
}
