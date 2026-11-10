import {
  BooleanField,
  Datagrid,
  List,
  NumberField,
  ReferenceField,
  TextField,
} from "react-admin";

export const ChallengeOptionsList = () => {
  return (
    <List>
      <Datagrid rowClick={false} bulkActionButtons={false}>
        <NumberField source="id" />
        <TextField source="text" />
        <BooleanField source="correct" />
        <ReferenceField
          link={false}
          source="challengeId"
          reference="challenges"
        />
        <TextField source="imageSrc" />
        <TextField source="audioSrc" />
      </Datagrid>
    </List>
  );
};
