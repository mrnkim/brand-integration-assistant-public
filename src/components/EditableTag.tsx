import { useState, KeyboardEvent, useRef, useEffect } from 'react';

interface EditableTagProps {
  value: string;
  category: string;
  onSave: (category: string, value: string) => Promise<void>;
  disabled?: boolean;
}

const EditableTag: React.FC<EditableTagProps> = ({
  value,
  category,
  onSave,
  disabled = false
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 편집 모드로 전환할 때 input에 focus
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const handleClick = () => {
    if (!disabled) {
      setIsEditing(true);
      setEditValue(value);
    }
  };

  const handleKeyDown = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();

      // 값이 달라졌을 때만 저장 (빈 문자열 포함)
      if (editValue !== value) {
        setIsSaving(true);
        try {
          await onSave(category, editValue);
        } catch (error) {
          console.error('Error saving tag:', error);
          // 에러 발생 시 원래 값으로 복구
          setEditValue(value);
        } finally {
          setIsSaving(false);
        }
      }

      setIsEditing(false);
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setEditValue(value);
    }
  };

  const handleBlur = async () => {
    // 값이 달라졌을 때만 저장 (빈 문자열 포함)
    if (editValue !== value) {
      setIsSaving(true);
      try {
        await onSave(category, editValue);
      } catch (error) {
        console.error('Error saving tag:', error);
        setEditValue(value);
      } finally {
        setIsSaving(false);
      }
    }

    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        className="px-2 py-1 text-xs border border-blue-400 rounded-full focus:outline-none focus:ring-1 focus:ring-blue-500"
        disabled={isSaving}
        size={Math.max(10, editValue.length + 2)}
      />
    );
  }

  return (
    <span
      onClick={handleClick}
      className={`px-2 py-1 bg-gray-100 rounded-full text-xs inline-block cursor-pointer hover:bg-gray-200 ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
      title={disabled ? "Can't edit while metadata is processing" : "Click to edit"}
    >
      {value}
      {isSaving && <span className="ml-1">...</span>}
    </span>
  );
};

export default EditableTag;