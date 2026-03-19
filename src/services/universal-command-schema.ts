export type UniversalCommandUiField = {
  name: string;
  value: string;
};

export type UniversalCommandUiComponent = {
  type: 'button' | 'dropdown' | 'modal';
  label?: string;
  action?: string;
  args?: Record<string, unknown>;
  options?: Array<{ label: string; value: string }>;
};

export type UniversalCommandUiSchema = {
  schemaVersion?: string;
  type: 'embed' | 'message';
  title?: string;
  description?: string;
  fields?: UniversalCommandUiField[];
  components?: UniversalCommandUiComponent[];
  followUps?: Array<{ type?: string; content?: string }>;
  ephemeral?: boolean;
};

export type UniversalCommandAttachment = {
  name: string;
  contentType?: string;
  dataBase64?: string;
  description?: string;
  embedImage?: boolean;
};

export type UniversalCommandResponse = {
  command: string;
  tier?: string;
  answer?: string;
  ui?: UniversalCommandUiSchema;
  attachments?: UniversalCommandAttachment[];
};
