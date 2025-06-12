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

  // Check if value is a URL
  const isUrl = (text: string): boolean => {
    try {
      new URL(text);
      return true;
    } catch {
      return false;
    }
  };

  const handleClick = (e?: React.MouseEvent) => {
    if (category.toLowerCase() === 'source' && value && isUrl(value.trim())) {
      // For source category, if it's a URL, open the link
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      window.open(value.trim(), '_blank', 'noopener,noreferrer');
    } else if (!disabled) {
      setIsEditing(true);
      setEditValue(value);
    }
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
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

    const tags = tagsBefore.map(tag => {
      const lowerTag = tag.toLowerCase();
      const capitalized = lowerTag.split(' ')
        .map(word => {
          const result = word.charAt(0).toUpperCase() + word.slice(1);
          return result;
        })
        .join(' ');
      return capitalized;
    });

    return tags.map((tag, index) => {
      const isSourceCategory = category.toLowerCase() === 'source';
      const isUrlTag = isSourceCategory && isUrl(tag);

      return (
        <div key={index} className="relative group flex items-center max-w-full">
          <span
            onClick={() => handleClick()}
            className={`
              px-2 py-1 border bg-gray-100 rounded-full text-sm inline-block mr-1 mb-1
              ${isUrlTag ? 'cursor-pointer' : 'cursor-pointer hover:bg-gray-200'}
              ${disabled ? 'opacity-60 cursor-not-allowed' : ''}
              max-w-full truncate overflow-hidden text-ellipsis whitespace-nowrap
              ${isSourceCategory ? 'max-w-[200px]' : ''}
            `}
            title={
              isUrlTag
                ? `Click to visit: ${tag}`
                : disabled
                  ? "Can't edit while metadata is processing"
                  : "Click to edit"
            }
          >
            {tag}
            {isSaving && index === tags.length - 1 && <span className="ml-1">...</span>}
          </span>

          {/* Edit button for source URLs */}
          {isSourceCategory && isUrlTag && !disabled && (
            <button
              onClick={handleEditClick}
              className="cursor-pointer hidden group-hover:block absolute -right-1 -top-1 bg-white border border-gray-300 rounded-full w-5 h-5 flex items-center justify-center text-xs text-gray-700 hover:text-gray-500 hover:bg-gray-50 z-10"
              title="Edit source URL"
            >
              ✎
            </button>
          )}
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
    <div className="flex flex-col flex-wrap items-center justify-center w-full overflow-hidden">
      <div className="flex flex-wrap items-center justify-center w-full max-w-full">
        {renderTags()}
        {renderAddButton()}
      </div>
      {!value && (
        <span className="sr-only">No {category} tags yet</span>
      )}
    </div>
  );
}

export default EditableTag;