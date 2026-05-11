import React, { useState } from "react";
import Avatar from "react-avatar";
import Select from "react-select";

type TagOption = {
  label: string;
  value: string;
};

type TagInputProps = {
  suggestions: string[];
  defaultValues?: TagOption[];
  placeholder: string;
  label: string;

  onChange: (values: TagOption[]) => void;
  value: TagOption[];
};

const TagInput: React.FC<TagInputProps> = ({
  suggestions,
  defaultValues = [],
  label,
  onChange,
  value,
}) => {
  const [input, setInput] = useState("");

  const options: TagOption[] = suggestions.map((suggestion) => ({
    label: suggestion,
    value: suggestion,
  }));

  const renderOption = (option: TagOption) => (
    <span className="flex items-center gap-2">
      <Avatar name={option.label} size="25" textSizeRatio={2} round={true} />
      {option.label}
    </span>
  );

  return (
    <div className="flex items-center rounded-md border">
      <span className="ml-3 text-sm text-gray-500">{label}</span>
      <Select<TagOption, true>
        value={value}
        onChange={(selected) => onChange([...selected])}
        className="w-full flex-1"
        isMulti
        onInputChange={setInput}
        defaultValue={defaultValues}
        placeholder={""}
        options={input ? options.concat({ label: input, value: input }) : options}
        formatOptionLabel={renderOption}
        classNames={{
          control: () => {
            return "!border-none !outline-none !ring-0 !shadow-none focus:border-none focus:outline-none focus:ring-0 focus:shadow-none dark:bg-transparent";
          },
          multiValue: () => {
            return "dark:!bg-gray-700";
          },
          multiValueLabel: () => {
            return "dark:text-white dark:bg-gray-700 rounded-md";
          },
        }}
        classNamePrefix="select"
      />
    </div>
  );
};

export default TagInput;
