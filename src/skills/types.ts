export interface SkillMeta {
  name: string;
  description: string;
  version?: string;
  'allowed-tools'?: string[];
  'disable-model-invocation'?: boolean;
}

export interface SkillDiscovery {
  name: string;
  description: string;
}

export interface Skill extends SkillMeta {
  instructions: string;
  scriptsDir?: string;
  referencesDir?: string;
}