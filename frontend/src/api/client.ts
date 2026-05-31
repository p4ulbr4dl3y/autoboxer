const API_URL = 'http://localhost:8000';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, options);
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || 'Request failed');
  }
  return res.json();
}

export const api = {
  // Projects
  projects: {
    list: () => request<any[]>('/api/v1/projects'),
    get: (id: number) => request<any>(`/api/v1/projects/${id}`),
    create: (data: any) =>
      request<any>('/api/v1/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    delete: (id: number) =>
      request<any>(`/api/v1/projects/${id}`, { method: 'DELETE' }),
    stats: (id: number) => request<any>(`/api/v1/projects/${id}/stats`),
    batchAutoLabel: (id: number, data: any) =>
      request<any>(`/api/v1/projects/${id}/auto-label-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    exportUrl: (id: number, format: string) =>
      `${API_URL}/api/v1/projects/${id}/export?format=${format}`,
  },

  // Classes
  classes: {
    create: (projectId: number, data: any) =>
      request<any>(`/api/v1/projects/${projectId}/classes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    update: (classId: number, data: any) =>
      request<any>(`/api/v1/classes/${classId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
  },

  // Images
  images: {
    list: (projectId: number, statusFilter?: string) => {
      const params = statusFilter && statusFilter !== 'all' ? `?status=${statusFilter}` : '';
      return request<any[]>(`/api/v1/projects/${projectId}/images${params}`);
    },
    upload: (projectId: number, files: FileList) => {
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
      }
      return request<any[]>(`/api/v1/projects/${projectId}/upload-images`, {
        method: 'POST',
        body: formData,
      });
    },
    fileUrl: (imageId: number) => `${API_URL}/api/v1/images/${imageId}/file`,
    autoLabel: (imageId: number, params: URLSearchParams) =>
      request<any[]>(`/api/v1/images/${imageId}/auto-label?${params.toString()}`, {
        method: 'POST',
      }),
  },

  // Annotations
  annotations: {
    get: (imageId: number) => request<any[]>(`/api/v1/images/${imageId}/annotations`),
    update: (imageId: number, annotations: any[]) =>
      request<any[]>(`/api/v1/images/${imageId}/annotations`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(annotations),
      }),
  },
};
