/**
 * ==========================================================================
 * formatters.ts - 공통 포매터 유틸리티 함수
 * ==========================================================================
 * 
 * 이 모듈은 프로젝트 전체에서 사용되는 포매팅 유틸리티를 제공합니다.
 * - formatBytes: 바이트를 사람이 읽기 쉬운 형식으로 변환
 * - formatDate: 날짜 문자열을 한국식 형식으로 변환
 * - getDataUrlSize: Data URL에서 원본 바이트 크기 추정
 * ==========================================================================
 */

/**
 * 바이트를 사람이 읽기 쉬운 문자열로 변환
 * @param bytes 바이트 수
 * @returns 포매팅된 문자열 (예: "1.5 MB")
 */
export const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

/**
 * 날짜 문자열을 한국식 형식으로 변환
 * @param dateStr ISO 8601 형식의 날짜 문자열
 * @returns 포매팅된 문자열 (예: "2024.01.15 14:30:00")
 */
export const formatDate = (dateStr?: string): string => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '-';
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

/**
 * Data URL에서 원본 바이트 크기를 추정
 * Base64 인코딩된 데이터의 원본 크기를 계산합니다.
 * 
 * @param src 이미지/미디어 소스 URL
 * @returns 추정된 바이트 크기 (외부 URL인 경우 0 반환)
 */
export const getDataUrlSize = (src: string): number => {
  if (src.startsWith('data:')) {
    // Base64 Data URL: 크기 = Base64 길이 * 3/4
    const base64Part = src.split(',')[1];
    if (base64Part) {
      return Math.floor(base64Part.length * 0.75);
    }
  }
  return 0; // 외부 URL - fetch 없이는 크기 알 수 없음
};
