import { useState, KeyboardEvent, useRef, useEffect } from 'react';

interface EditableTagProps {
  value: string; // 쉼표로 구분된 태그 값
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

  // 편집 모드나 추가 모드로 전환할 때 적절한 input에 focus
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    } else if (isAddingNew && newTagInputRef.current) {
      newTagInputRef.current.focus();
    }
  }, [isEditing, isAddingNew]);

  const handleClick = () => {
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

  const handleNewTagBlur = async () => {
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
  };

  // 쉼표로 구분된 태그를 배열로 분리하여 각각 표시
  const renderTags = () => {
    if (!value) return null;

    // 쉼표로 구분된 태그를 배열로 변환
    const tagsBefore = value.split(',')
      .map(tag => tag.trim())
      .filter(tag => tag !== '');


    const tags = tagsBefore.map(tag => {

      // 1. 전체 태그를 먼저 소문자로 변환
      const lowerTag = tag.toLowerCase();

      // 2. 각 단어의 첫 글자만 대문자로 변환
      const capitalized = lowerTag.split(' ')
        .map(word => {
          const result = word.charAt(0).toUpperCase() + word.slice(1);
          return result;
        })
        .join(' ');

      return capitalized;
    });


    return tags.map((tag, index) => (
      <span
        key={index}
        onClick={handleClick}
        className={`px-2 py-1 border bg-gray-100 rounded-full text-sm inline-block mr-1 mb-1 cursor-pointer hover:bg-gray-200 ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
        title={disabled ? "Can't edit while metadata is processing" : "Click to edit"}
      >
        {tag}
        {isSaving && index === tags.length - 1 && <span className="ml-1">...</span>}
      </span>
    ));
  };

  // 새 태그 추가 버튼 렌더링
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
        className="px-2 py-1 text-xs border border-blue-400 rounded-full focus:outline-none focus:ring-1 focus:ring-blue-500"
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
    <div className="flex flex-col flex-wrap items-center justify-center w-full">
      {renderTags()}
      {renderAddButton()}
      {!value && (
        <span className="sr-only">No {category} tags yet</span>
      )}
    </div>
  );
}

export default EditableTag;