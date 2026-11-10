import {
  Datagrid,
  List,
  NumberField,
  ReferenceField,
  TextField,
} from "react-admin";

export const UnitList = () => {
  return (
    <List>
      <Datagrid rowClick={false} bulkActionButtons={false}>
        <NumberField source="id" />
        <TextField source="title" />
        <TextField source="description" />
        <ReferenceField link={false} source="courseId" reference="courses" />
        <TextField source="order" />
      </Datagrid>
    </List>
  );
};
