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
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [newTagValue, setNewTagValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const newTagInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    } else if (isAddingNew && newTagInputRef.current) {
      newTagInputRef.current.focus();
    }
  }, [isEditing, isAddingNew]);

  const handleClick = () => {
    // 일반 태그 클릭 시 편집 모드로 전환
    if (!disabled) {
      setIsEditing(true);
      setEditValue(value);
    }
  };

  const handleAddNewClick = () => {
    if (!disabled) {
      setIsAddingNew(true);
      setNewTagValue('');
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

  const handleNewTagKeyDown = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();

      if (newTagValue.trim()) {
        setIsSaving(true);
        try {
          // 기존 태그에 새 태그 추가
          const updatedValue = value ? `${value}, ${newTagValue.trim()}` : newTagValue.trim();
          await onSave(category, updatedValue);
        } catch (error) {
          console.error('Error adding new tag:', error);
        } finally {
          setIsSaving(false);
        }
      }

      setIsAddingNew(false);
      setNewTagValue('');
    } else if (e.key === 'Escape') {
      setIsAddingNew(false);
      setNewTagValue('');
    }
  };

  const handleBlur = async () => {
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

  const handleNewTagBlur = async () => {
    if (newTagValue.trim()) {
      setIsSaving(true);
      try {
        const updatedValue = value ? `${value}, ${newTagValue.trim()}` : newTagValue.trim();
        await onSave(category, updatedValue);
      } catch (error) {
        console.error('Error adding new tag:', error);
      } finally {
        setIsSaving(false);
      }
    }

    setIsAddingNew(false);
  };

  const renderTags = () => {
    if (!value) return null;

    const tagsBefore = value.split(',')
      .map(tag => tag.trim())
      .filter(tag => tag !== '');

    return tagsBefore.map((tag, index) => {
      // source 태그도 일반 태그와 동일하게 처리
      // 첫 글자 대문자 변환은 source에는 적용하지 않음(원본 그대로 표시)
      const isSourceCategory = category.toLowerCase() === 'source';
      const displayTag = isSourceCategory ? tag : tag.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

      return (
        <div key={index} className="relative group inline-flex items-center mb-1">
          <span
            onClick={handleClick}
            className={`
              px-2 py-1 border bg-gray-100 rounded-full text-sm inline-block
              cursor-pointer hover:bg-gray-200
              ${disabled ? 'opacity-60 cursor-not-allowed' : ''}
              truncate overflow-hidden whitespace-nowrap
              ${isSourceCategory ? 'max-w-[200px]' : 'max-w-[80px]'}
              transition-all duration-200 hover:bg-gray-200
            `}
            title={displayTag}
          >
            {displayTag}
            {isSaving && index === tagsBefore.length - 1 && <span className="ml-1">...</span>}
          </span>
        </div>
      );
    });
  };

  const renderAddButton = () => (
    <span
      onClick={handleAddNewClick}
      className={`px-2 py-1 rounded-full text-sm text-gray-300 inline-block cursor-pointer hover:bg-gray-200 ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
      title={disabled ? "Can't add tags while metadata is processing" : "Add new tag"}
    >
      +
    </span>
  );

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        className="px-2 py-1 text-xs border border-green rounded-full focus:outline-none focus:ring-1"
        disabled={isSaving}
        size={Math.max(10, editValue.length + 2)}
        placeholder="Enter comma-separated tags"
      />
    );
  }

  if (isAddingNew) {
    return (
      <input
        ref={newTagInputRef}
        type="text"
        value={newTagValue}
        onChange={(e) => setNewTagValue(e.target.value)}
        onKeyDown={handleNewTagKeyDown}
        onBlur={handleNewTagBlur}
        className="px-2 py-1 text-xs border border-blue-400 rounded-full focus:outline-none focus:ring-1 focus:ring-blue-500"
        disabled={isSaving}
        size={Math.max(10, newTagValue.length + 2)}
        placeholder={`Add new ${category}`}
      />
    );
  }

  return (
    <div className="flex flex-col items-start justify-start w-full min-h-[40px]">
      <div className="flex flex-wrap items-start justify-start w-full max-w-full py-1 gap-1">
        {renderTags()}
      </div>
      <div className="w-full flex justify-start mt-1">
        {renderAddButton()}
      </div>
      {!value && (
        <span className="sr-only">No {category} tags yet</span>
      )}
    </div>
  );
}

export default EditableTag;