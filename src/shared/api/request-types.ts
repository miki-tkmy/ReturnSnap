export interface GasRequest<T = any> {
  action: string;
  requestId: string;
  deviceId?: string;
  deviceToken?: string;
  payload: T;
}

export interface GasResponse<T = any> {
  action: string;
  requestId: string;
  success: boolean;
  payload?: T;
  error?: {
    code: string;
    message: string;
  };
}
