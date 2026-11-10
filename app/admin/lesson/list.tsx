import {
  Datagrid,
  List,
  NumberField,
  ReferenceField,
  TextField,
} from "react-admin";

export const LessonList = () => {
  return (
    <List>
      <Datagrid rowClick={false} bulkActionButtons={false}>
        <NumberField source="id" />
        <TextField source="title" />
        <ReferenceField link={false} source="unitId" reference="units" />
        <NumberField source="order" />
      </Datagrid>
    </List>
  );
};
