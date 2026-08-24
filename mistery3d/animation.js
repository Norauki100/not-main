class CharacterAnimator {
  constructor(THREE_NS) {
    this.THREE = THREE_NS;
    this.character = null;
    this.bones = {};
    this.map = {};
    this.walkClock = 0;
    this.idleClock = 0;
    this.speed = 0;
    this.bobOffset = 0;

    this._parentWorldQuat = new THREE_NS.Quaternion();
    this._characterWorldQuat = new THREE_NS.Quaternion();
    this._localOffset = new THREE_NS.Quaternion();
  }

  static get ROLE_KEYWORDS() {
    return {
      hip:      ['hips', 'hip', 'pelvis'],
      neck:     ['neck'],
      head:     ['head'],
      forearm:  ['forearm', 'fore_arm', 'lowerarm', 'lower_arm'],
      upperarm: ['upperarm', 'upper_arm', 'shoulder', 'arm'],
      hand:     ['hand'],
      calf:     ['lowerleg', 'lower_leg', 'calf', 'shin'],
      thigh:    ['upperleg', 'upper_leg', 'thigh', 'leg'],
      foot:     ['foot'],
      spine2:   ['spine2', 'spine02', 'spine_02', 'chest', 'upperchest'],
      spine1:   ['spine1', 'spine01', 'spine_01', 'spine'],
    };
  }

  static get ROLE_CHECK_ORDER() {
    return ['hip', 'neck', 'head', 'forearm', 'upperarm', 'hand', 'calf', 'thigh', 'foot', 'spine2', 'spine1'];
  }

  static get EXCLUDE_KEYWORDS() {
    return ['twist', 'roll', 'sharebone', '_end', 'end_', 'ik', 'pole', 'nub', 'finger', 'thumb', 'index', 'middle', 'ring', 'pinky'];
  }

  static detectSide(name) {
    const n = name.toLowerCase();
    if (/(^|[_. ])l($|[_. ])/.test(n) || n.includes('left')) return 'L';
    if (/(^|[_. ])r($|[_. ])/.test(n) || n.includes('right')) return 'R';
    return null;
  }

  static detectRole(name) {
    const lower = name.toLowerCase();
    if (CharacterAnimator.EXCLUDE_KEYWORDS.some((kw) => lower.includes(kw))) return null;
    const KW = CharacterAnimator.ROLE_KEYWORDS;
    for (const role of CharacterAnimator.ROLE_CHECK_ORDER) {
      for (const kw of KW[role]) {
        if (lower.includes(kw)) return role;
      }
    }
    return null;
  }

  _buildBoneMap(bones) {
    const map = {};
    for (const name in bones) {
      const role = CharacterAnimator.detectRole(name);
      if (!role) continue;
      const side = CharacterAnimator.detectSide(name);
      const key = side ? (side + '_' + role) : role;
      if (!map[key]) map[key] = name;
    }
    return map;
  }

  bindToCharacter(character, bones) {
    this.character = character;
    this.bones = bones;
    this.map = this._buildBoneMap(bones);
    for (const name in bones) {
      bones[name].userData.bindQuat = bones[name].quaternion.clone();
      bones[name].userData.bindPos = bones[name].position.clone();
    }
    this._applyNeutralPose();
  }

  getBobOffset() {
    return this.bobOffset;
  }

  hasRole(key) {
    return !!this.map[key];
  }

  _bounceBoneLocalY(role, deltaY) {
    const name = this.map[role];
    if (!name) return;
    const b = this.bones[name];
    if (!b || !b.userData.bindPos) return;
    b.position.y = b.userData.bindPos.y + deltaY;
  }

  _poseBoneWorld(role, charEx, charEy, charEz) {
    const name = this.map[role];
    if (!name) return;
    const THREE_NS = this.THREE;
    const b = this.bones[name];
    if (!b || !b.userData.bindQuat || !this.character) return;

    const charDelta = new THREE_NS.Quaternion().setFromEuler(new THREE_NS.Euler(charEx, charEy, charEz));

    this.character.getWorldQuaternion(this._characterWorldQuat);
    b.parent.getWorldQuaternion(this._parentWorldQuat);

    const parentInv = this._parentWorldQuat.clone().invert();
    const charInv = this._characterWorldQuat.clone().invert();

    this._localOffset
      .copy(parentInv)
      .multiply(this._characterWorldQuat)
      .multiply(charDelta)
      .multiply(charInv)
      .multiply(this._parentWorldQuat);

    b.quaternion.copy(this._localOffset).multiply(b.userData.bindQuat);
    b.updateMatrixWorld(true);
  }

  _resetToBindPose() {
    for (const name in this.bones) {
      const b = this.bones[name];
      if (b.userData.bindQuat) b.quaternion.copy(b.userData.bindQuat);
    }
    if (this.character) this.character.updateMatrixWorld(true);
  }

  _applyNeutralPose() {
    this._resetToBindPose();
    if (!this.hasRole('L_upperarm') && !this.hasRole('R_upperarm')) return;

    this._poseBoneWorld('L_upperarm', 0, 0, -1.15);
    this._poseBoneWorld('R_upperarm', 0, 0, 1.15);

    this._poseBoneWorld('L_forearm', -0.25, 0, 0);
    this._poseBoneWorld('R_forearm', -0.25, 0, 0);

    this._poseBoneWorld('L_thigh', 0, 0, -0.05);
    this._poseBoneWorld('R_thigh', 0, 0, 0.05);

    for (const name in this.bones) {
      this.bones[name].userData.neutralQuat = this.bones[name].quaternion.clone();
    }
  }

  _resetToNeutralPose() {
    for (const name in this.bones) {
      const b = this.bones[name];
      const ref = b.userData.neutralQuat || b.userData.bindQuat;
      if (ref) b.quaternion.copy(ref);
      if (b.userData.bindPos) b.position.copy(b.userData.bindPos);
    }
    if (this.character) this.character.updateMatrixWorld(true);
  }

  _applyWalkPose(phase, intensity, running) {
    const s = Math.sin(phase);
    const s2 = Math.sin(phase + Math.PI);

    const strideShape = Math.sign(s) * Math.pow(Math.abs(s), 0.8);
    const strideShape2 = Math.sign(s2) * Math.pow(Math.abs(s2), 0.8);

    const runFactor = running ? 1.35 : 1.0;
    const swing = 0.62 * intensity * runFactor;
    const kneeBend = (running ? 1.15 : 0.85) * intensity;
    const lKnee = Math.pow(Math.max(0, -Math.sin(phase + 0.5)), 0.85) * kneeBend;
    const rKnee = Math.pow(Math.max(0, -Math.sin(phase + Math.PI + 0.5)), 0.85) * kneeBend;

    const armSwing = (running ? 0.62 : 0.42) * intensity;
    const elbowBase = running ? 0.55 : 0.22;

    const hipYaw = s * 0.12 * intensity;
    const hipRoll = s * 0.07 * intensity;
    const lean = running ? 0.12 * intensity : 0.02 * intensity;

    this._poseBoneWorld('hip', 0, hipYaw, hipRoll);

    const bobRaw = Math.abs(Math.sin(phase));
    const hipBounceRatio = Math.pow(bobRaw, 1.6) * 0.028 * intensity * (running ? 1.3 : 1.0);
    const hipName = this.map['hip'];
    if (hipName && this.bones[hipName] && this.bones[hipName].userData.bindPos) {
      const hipBindY = this.bones[hipName].userData.bindPos.y;
      this._bounceBoneLocalY('hip', hipBindY * hipBounceRatio);
    }

    this._poseBoneWorld('L_thigh', -strideShape * swing, 0, -0.05);
    this._poseBoneWorld('R_thigh', -strideShape2 * swing, 0, 0.05);
    this._poseBoneWorld('L_calf', lKnee, 0, 0);
    this._poseBoneWorld('R_calf', rKnee, 0, 0);

    this._poseBoneWorld('L_foot', -lKnee * 0.45 - strideShape * 0.18 * intensity, 0, 0);
    this._poseBoneWorld('R_foot', -rKnee * 0.45 - strideShape2 * 0.18 * intensity, 0, 0);

    this._poseBoneWorld('spine1', lean * 0.4, -hipYaw * 0.5, s * 0.02 * intensity);
    this._poseBoneWorld('spine2', lean * 0.6, -hipYaw * 0.3, s * 0.015 * intensity);

    this._poseBoneWorld('L_upperarm', -strideShape2 * armSwing, 0, -1.15 + 0.12 * intensity);
    this._poseBoneWorld('R_upperarm', -strideShape * armSwing, 0, 1.15 - 0.12 * intensity);
    this._poseBoneWorld('L_forearm', -0.25 - (elbowBase * intensity + Math.abs(strideShape2) * 0.28 * intensity), 0, 0);
    this._poseBoneWorld('R_forearm', -0.25 - (elbowBase * intensity + Math.abs(strideShape) * 0.28 * intensity), 0, 0);

    this.bobOffset = Math.pow(bobRaw, 1.6) * 0.045 * intensity * (running ? 1.3 : 1.0);
  }

  _applyIdlePose(idleClock) {
    const breathe = Math.sin(idleClock * 1.1) * 0.012;
    const sway = Math.sin(idleClock * 0.6) * 0.01;
    this._poseBoneWorld('hip', 0, 0, sway * 0.5);
    this._poseBoneWorld('spine2', breathe, 0, sway);
    this.bobOffset = Math.abs(Math.sin(idleClock * 1.1)) * 0.006;
  }

  _updateSkeletons() {
    if (!this.character) return;
    this.character.traverse((obj) => {
      if (obj.isSkinnedMesh && obj.skeleton) {
        obj.skeleton.update();
      }
    });
  }

  update(dt, input) {
    if (!this.character || Object.keys(this.bones).length === 0) return;

    const moving = !!(input && input.moving);
    const running = !!(input && input.running);

    this.speed += ((moving ? (running ? 1.6 : 1.0) : 0) - this.speed) * Math.min(1, dt * 8);

    this._resetToNeutralPose();

    const strideIntensity = Math.min(1, this.speed);
    const cycleSpeed = running ? 9 : 6;

    if (strideIntensity > 0.02) {
      this.walkClock += dt * cycleSpeed * (0.15 + strideIntensity);
      this._applyWalkPose(this.walkClock, strideIntensity, running);
      this.idleClock = 0;
    } else {
      this.idleClock += dt;
      this._applyIdlePose(this.idleClock);
    }

    this._updateSkeletons();
  }
}
